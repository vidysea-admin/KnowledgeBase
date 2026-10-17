"""UNEXECUTED proposal; requires separate approved, private, fresh host activation.

credentials.json (private, never print):
{"rootUser":"acceptance_root","rootPassword":"random",
 "fixtureUser":"acceptance_fixture","fixturePassword":"distinct-random",
 "t059User":"acceptance_t059","t059Password":"third-distinct-random"}
Parent broker must bound lifetime, sanitize failure output and secure credentials.
"""
import json
import sys
import time
import uuid
from pathlib import Path

from pymongo import MongoClient
from pymongo.errors import AutoReconnect, OperationFailure
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern


def client(**auth):
    # Never read MONGODB_URL or accept a caller-supplied endpoint/database.
    return MongoClient("mongodb://127.0.0.1:27029", directConnection=True,
                       serverSelectionTimeoutMS=2000, connectTimeoutMS=2000,
                       socketTimeoutMS=5000, appname="isolated-synthetic-acceptance",
                       **auth)


def run():
    credentials = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    assert credentials["rootUser"] != credentials["fixtureUser"]
    assert credentials["rootPassword"] != credentials["fixturePassword"]
    with client() as bootstrap:
        bootstrap.admin.command("replSetInitiate", {
            "_id": "lkbAcceptance", "members": [{"_id": 0, "host": "localhost:27029"}]})
        deadline = time.monotonic() + 45
        while True:
            try:
                hello = bootstrap.admin.command("hello")
                if hello.get("isWritablePrimary"):
                    assert hello.get("setName") == "lkbAcceptance"
                    break
            except AutoReconnect:
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError("primary deadline")
            time.sleep(0.25)
        bootstrap.admin.command("createUser", credentials["rootUser"],
                                pwd=credentials["rootPassword"],
                                roles=[{"role": "root", "db": "admin"}])
    with client(username=credentials["rootUser"], password=credentials["rootPassword"],
                authSource="admin") as admin:
        admin["lkb_staging"].command("createUser", credentials["fixtureUser"],
                                    pwd=credentials["fixturePassword"],
                                    roles=[{"role": "readWrite", "db": "lkb_staging"}])
        # Separate exact namespace required by goal-t059 packet's lkb_t059_* guard.
        admin["lkb_t059_acceptance"].command("createUser", credentials["t059User"],
                                          pwd=credentials["t059Password"],
                                          roles=[{"role": "readWrite", "db": "lkb_t059_acceptance"}])
    with client(username=credentials["fixtureUser"], password=credentials["fixturePassword"],
                authSource="lkb_staging") as fixture:
        db = fixture.get_database("lkb_staging")
        assert db.name == "lkb_staging" and db.name != "lkb"
        hello = fixture.admin.command("hello")
        assert hello.get("setName") == "lkbAcceptance" and hello.get("isWritablePrimary")
        name = "synthetic_tx_" + uuid.uuid4().hex
        collection = db.create_collection(name)
        try:
            with fixture.start_session() as session:
                with session.start_transaction(read_concern=ReadConcern("snapshot"),
                                               write_concern=WriteConcern("majority", wtimeout=5000)):
                    collection.insert_one({"_id": "committed", "synthetic": True}, session=session)
            assert collection.count_documents({"_id": "committed"}) == 1
            with fixture.start_session() as session:
                session.start_transaction(write_concern=WriteConcern("majority", wtimeout=5000))
                collection.insert_one({"_id": "aborted", "synthetic": True}, session=session)
                session.abort_transaction()
            assert collection.count_documents({"_id": "aborted"}) == 0
            # Read-only forbidden-DB command: no production writes, even as a negative test.
            try:
                fixture["lkb"].command("listCollections", nameOnly=True)
            except OperationFailure as error:
                assert error.code == 13
            else:
                raise AssertionError("fixture unexpectedly reads lkb")
        finally:
            collection.drop()
    print(json.dumps({"syntheticCommit": True, "syntheticAbort": True,
                      "productionReadDenied": True, "applicationAcceptance": False}))


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        # Never serialize exception values: driver errors may contain endpoint/auth detail.
        print(json.dumps({"ok": False, "errorType": type(error).__name__}))
        raise SystemExit(1)

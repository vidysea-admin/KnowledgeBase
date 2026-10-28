"""Wiring for the generic page agent inside sb_join: env flags, goal, profile map and .env keys. LKB_PAGE_AGENT=1 enables it."""
import json
import os

import page_agent
import page_agent_guard as guard
import page_agent_model as model
from sb_join_onair import OnairRefused

DEFAULT_GOAL = "get the webinar replay or live session playing"


def agent_enabled(env=None):
    return (os.environ if env is None else env).get("LKB_PAGE_AGENT") == "1"


def agent_profile(env=None):
    """LKB_AGENT_PROFILE: JSON object of string values the agent may type (name, email, organization, role, country). Else empty."""
    raw = (os.environ if env is None else env).get("LKB_AGENT_PROFILE", "")
    try:
        data = json.loads(raw) if raw else {}
    except ValueError:
        raise OnairRefused("page-agent refused: LKB_AGENT_PROFILE is not valid JSON")
    if not isinstance(data, dict) or not all(isinstance(k, str) and isinstance(v, str) and len(v) <= 200 for k, v in data.items()):
        raise OnairRefused("page-agent refused: LKB_AGENT_PROFILE must be a JSON object of short strings")
    return data


def agent_prepare(sb, *, time, emit, env=None, runner=page_agent.run_agent):
    env = os.environ if env is None else env
    model.load_env(env.get("LKB_DOTENV") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".env"))
    goal = env.get("LKB_AGENT_GOAL") or DEFAULT_GOAL
    try:
        steps = runner(sb, goal, time=time, emit=emit, profile=agent_profile(env), allow_submit=env.get("LKB_AGENT_ALLOW_SUBMIT") == "1")
    except guard.AgentRefused as e:
        raise OnairRefused("page-agent refused: %s" % e)  # main() turns this into a `fatal` event (exit 1)
    except RuntimeError as e:
        raise OnairRefused("page-agent failed: %s" % e)
    emit("page-agent-done", steps=steps)

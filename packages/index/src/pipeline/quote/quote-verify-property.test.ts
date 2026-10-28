/**
 * packages/index/src/pipeline/quote-verify-property.test.ts — fix cycle 2 of T-040: a property test that
 * does NOT enumerate symbols (random code points from the whole BMP plus astral planes), the honest
 * direction (whitespace-aligned quotes verify with exact offsets) and the false-refusal measurement on
 * natural English / Hinglish sentences.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyQuotes, normaliseForQuote, type QuoteSourceTurn } from "./quote-verify.js";
import { isWhitespace } from "./quote-token-rule.js";

const OPENING = [..."\"'([{«‹"], CLOSING = [..."\"'.,;:!?)]}»›…।॥"];
let seed = 20261011;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

/** A random code point from the whole BMP (minus surrogates) or an astral plane, never whitespace/opening/closing. */
function randomSymbol(allowMarks: boolean): string {
  for (;;) {
    const cp = rnd() < 0.9 ? Math.floor(rnd() * 0xd800) : 0x10000 + Math.floor(rnd() * (0x110000 - 0x10000));
    const c = String.fromCodePoint(cp);
    const n = normaliseForQuote(`a${c}b`).slice(1, -1); // what the verifier sees (curly quotes etc. normalise into the sets)
    if (isWhitespace(c) || [...n].some((x) => OPENING.includes(x) || CLOSING.includes(x) || isWhitespace(x))) continue;
    if (/\p{Cc}/u.test(c) || n === "" || (!allowMarks && /\p{M}/u.test(c))) continue; // control characters make the QUOTE invalid (refused for another reason)
    return c;
  }
}

test("property: any non-whitespace, non-opening, non-closing code point makes every adjacent cut refused", () => {
  let cuts = 0;
  for (let i = 0; i < 4000; i++) {
    const c = randomSymbol(true);
    const pre = `zqa${i} zqb${i} `, post = ` zqc${i} zqd${i}`;
    const id = `U+${c.codePointAt(0)!.toString(16)}`;
    // inside a token: quotes ending before / after the symbol, starting at / after it
    const mid: QuoteSourceTurn[] = [{ id: "m", text: `${pre}ab${c}cd${post}` }];
    verifyQuotes(mid, [pre + "ab", pre + "ab" + c, c + "cd" + post, "cd" + post]).forEach((v, k) => { assert.equal(v.ok, false, `${id} mid cut#${k}`); cuts++; });
    // a prefix symbol ("$5"): a quote starting right after it; a suffix symbol ("10+"): a quote ending right before it
    const [p1] = verifyQuotes([{ id: "p", text: `${pre}${c}ab${post}` }], ["ab" + post]);
    const [s1] = verifyQuotes([{ id: "s", text: `${pre}ab${c}${post}` }], [pre + "ab"]);
    assert.equal(p1!.ok, false, `${id} prefix`); assert.equal(s1!.ok, false, `${id} suffix`); cuts += 2;
  }
  console.log(`symbol property: 4000 random code points (whole BMP + astral), ${cuts} adjacent cuts, all refused`);
  assert.equal(cuts, 4000 * 6);
});

test("property (honest direction): whitespace-aligned quotes with optional closing punctuation verify with exact offsets", () => {
  let verified = 0;
  for (let i = 0; i < 1500; i++) {
    const c = randomSymbol(false);
    const tok = rnd() < 0.5 ? `ab${c}cd` : rnd() < 0.5 ? `${c}ab` : `ab${c}`;
    let punct = rnd() < 0.5 ? "" : CLOSING[Math.floor(rnd() * CLOSING.length)]!;
    if ((punct === '"' || punct === "'") && /\p{N}$/u.test(tok)) punct = ""; // by design: 5' and 5" are unit marks, not closing
    const open = rnd() < 0.3 ? OPENING[Math.floor(rnd() * OPENING.length)]! : "";
    const pre = `zqa${i} zqb${i} `, post = ` zqc${i} zqd${i}`;
    const text = `${pre}${open}${tok}${punct}${post}`;
    const turns: QuoteSourceTurn[] = [{ id: "t", text }];
    for (const q of [`${pre}${open}${tok}`, `${pre}${open}${tok}${punct}`, `zqb${i} ${open}${tok}${punct}${post}`, `${open}${tok}${punct}${post}`]) {
      const [v] = verifyQuotes(turns, [q]);
      assert.equal(v!.ok, true, `U+${c.codePointAt(0)!.toString(16)} ${JSON.stringify(q)}`);
      if (v!.ok) { const l = v!.locations[0]!; assert.equal(text.slice(l.start, l.end), q); verified++; }
    }
  }
  assert.equal(verified, 6000);
  console.log(`honest direction: ${verified}/6000 aligned quotes verified with text.slice(start,end) === quote`);
});

const SENTENCES = [
  "So, the admission fee is 4500 rupees, and it is not refundable after the first week.",
  "Honestly, I don't think we should rush this; let's wait for the results first.",
  "The deadline is 15 March, but the form opens on 1st March at 10:30 sharp.",
  "Dr. Rao said the U.S. embassy needs the documents by Friday, e.g. the passport copy.",
  "Wait... that's not what I meant, I meant the second batch (the evening one).",
  "Can you share the scholarship details? I'd like to check the eligibility, please!",
  "We got 50% of the seats filled, which is up from 3.5% last year.",
  "He said, \"we agree on the fee\", and then he left the meeting early.",
  "The hostel costs $200 per month, or about ₹16,500, including food.",
  "Please re-send the e-mail to the admissions team; they replied yesterday.",
  "It's a good college, but the placement record isn't great, to be honest.",
  "Our counsellor will call you tomorrow at 5 pm, so keep your phone nearby.",
  "Rashi's father asked about the IELTS score, and whether 6.5 is enough.",
  "Let me explain: first you apply, then you upload documents, then you pay the fee.",
  "That's all for today, thank you everyone for joining the session.",
  "Is the course 2 years or 3 years? I read somewhere that it was changed.",
  "Okay so, the visa interview is on Monday, and the embassy opens at nine.",
  "The syllabus covers data structures, algorithms, and databases, in that order.",
  "Hum log aaj admission process discuss karenge, phir fees ke baare mein baat hogi.",
  "Aapko form 15 March tak bharna hai, uske baad late fee lagegi.",
  "Dekhiye, scholarship ke liye marks 85% se zyada hone chahiye.",
  "Mujhe lagta hai ki hostel ki fees thodi zyada hai, kya kuch discount milega?",
  "Haan ji, bilkul; main aapko email kar deta hoon, thoda wait kijiye.",
  "Ye course bahut accha hai, lekin placement ke baare mein pehle pata kar lijiye.",
  "Acha, toh aap Delhi se hain? Humara campus Pune mein hai, 20 km door.",
  "Fees 4500 rupees hai (GST alag se), aur payment online hi hoga.",
  "Nahi nahi, ye refundable nahi hai; pehle hi bata diya tha maine.",
  "Kal ka session 10:30 baje shuru hoga, please time pe aa jaiye.",
  "Hmm, I think the answer is yes... but let me check with the team first.",
  "The total comes to Rs. 45,000 per semester, payable in two installments.",
  "She asked: \"Is the hostel mandatory?\" and I said no, it is optional.",
  "We have three intakes, in January, July and October, as far as I know.",
  "If you score above 90, the scholarship is automatic; otherwise there's an interview.",
  "Tumhara naam kya hai? Aur kaunsa course chahiye, B.Tech ya MBA?",
  "Right, so that's the plan: apply by Friday, pay by Monday, join on Tuesday.",
  "The brochure says 100% placement, but nobody could show us the data.",
  "Chaliye, ab questions lete hain; pehle aap boliye, phir Priya ji.",
  "I'll send the link in the chat, so please check it after the call.",
  "Ye sab documents original chahiye, photocopy nahi chalegi, samjhe?",
  "Thanks, that was helpful; I'll talk to my parents and get back to you.",
];

test("false-refusal cost: whitespace-aligned quotes of 3+ words on 40 natural English/Hinglish sentences", () => {
  assert.equal(SENTENCES.length, 40);
  const stripOpen = (w: string): string => { const a = [...w]; while (a.length && OPENING.includes(a[0]!)) a.shift(); return a.join(""); };
  const stripClose = (w: string): string => { const a = [...w]; while (a.length && CLOSING.includes(a[a.length - 1]!)) a.pop(); return a.join(""); };
  let total = 0, verified = 0;
  const refusedShapes: string[] = [];
  SENTENCES.forEach((text, n) => {
    const words = text.split(" ");
    const turns: QuoteSourceTurn[] = [{ id: `s${n}`, text }];
    for (let i = 0; i < words.length; i++) for (let j = i + 3; j <= Math.min(words.length, i + 6); j++) {
      const raw = words.slice(i, j).join(" ");
      const ws = words.slice(i, j); // first word loses only OPENING punctuation, last word only CLOSING punctuation
      const trimmed = [stripOpen(ws[0]!), ...ws.slice(1, -1), stripClose(ws[ws.length - 1]!)].join(" ");
      for (const q of new Set([raw, trimmed])) {
        if ([...q].length < 12) continue; // below the verifier's minimum length: not a quote candidate
        total++;
        const [v] = verifyQuotes(turns, [q]);
        if (v!.ok && text.slice(v!.locations[0]!.start, v!.locations[0]!.end) === q) verified++;
        else refusedShapes.push(`${q} <- ${text}`);
      }
    }
  });
  console.log(`false-refusal: ${verified}/${total} whitespace-aligned quotes verified; refused: ${refusedShapes.length}`);
  for (const r of refusedShapes.slice(0, 20)) console.log("  refused:", r);
  assert.equal(refusedShapes.length, 0, refusedShapes.slice(0, 5).join("\n"));
});

import { convert as cssColor } from "@asamuzakjp/css-color";
import { tokenize, TokenType, type CSSToken } from "@csstools/css-tokenizer";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { parse as parseCss, type Declaration } from "postcss";

const MAX_URL = 2048;
const MAX_STYLESHEETS = 16, MAX_HIDING_SELECTORS = 1024;
const clean = (text: string) => text.replace(/\s+/gu, " ").trim();
type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;
type Matches = (element: HtmlElement) => boolean;
const isElement = (node: HtmlNode): node is HtmlElement => "tagName" in node;
const children = (node: HtmlNode) => "childNodes" in node ? node.childNodes : [];
const attr = (node: HtmlElement, name: string) => node.attrs.find(a => a.name === name)?.value;
const rawText = (node: HtmlNode) => children(node).map(child => "value" in child ? child.value : "").join("");
const OMIT = new Set("aside audio button canvas details dialog footer form header iframe math menu nav noscript object script select style svg template textarea video".split(" "));
const BLOCK = new Set("address article blockquote br caption dd div dl dt figcaption figure h1 h2 h3 h4 h5 h6 hr li main ol p pre section table td th tr ul".split(" "));
const parentElement = (node: HtmlElement) => node.parentNode && isElement(node.parentNode) ? node.parentNode : null;
const cssTokens = (css: string) => tokenize({ css }, { onParseError: error => { throw error; } })
  .filter(([kind]) => kind !== TokenType.Comment && kind !== TokenType.EOF);
const blank = (token: CSSToken | undefined) => token?.[0] === TokenType.Whitespace;


export function publisherUrl(value: string, base?: string): string | null {
  if (!value || value.length > MAX_URL || /[\s\\]/u.test(value) || /^(?:https:)?\/\/[^/?#]*@/i.test(value)) return null;
  const url = URL.parse(value, base);
  if (!url || url.protocol !== "https:" || url.username || url.password || url.port) return null;
  url.hash = "";
  return url.href.length <= MAX_URL ? url.href : null;
}

function conceals(decl: Declaration): boolean {
  const prop = decl.prop.toLowerCase(), value = decl.value.replace(/\/\*[\s\S]*?\*\//g, "").trim().toLowerCase();
  if (prop.includes("\\")) return true;
  if (/^(?:-webkit-)?animation(?:-name)?$/.test(prop)) return value !== "none";
  if (prop === "display") return !/^(?:block|inline(?:-block|-flex|-grid|-table)?|contents|flex|flow-root|grid|list-item|table(?:-[a-z-]+)?|initial|unset)$/.test(value);
  if (prop === "visibility") return !/^(?:visible|initial|inherit|unset)$/.test(value);
  if (prop === "content-visibility") return !/^(?:visible|auto|initial|inherit|unset)$/.test(value);
  if (prop === "opacity") return !/^(?:0?\.\d*[1-9]\d*|1(?:\.0+)?)$/.test(value);
  if (/^(?:-webkit-)?(?:clip-path|mask(?:-image)?)$/.test(prop) || prop === "clip") return !/^(?:none|auto|initial)$/.test(value);
  if (prop === "color" || prop === "-webkit-text-fill-color") {
    if (/^(?:currentcolor|inherit|initial|unset)$/.test(value)) return false;
    // Unknown dynamic colors cannot establish visibility. An inherited color is checked on its ancestor.
    if (value.length > 512 || /\b(?:var|env|attr)\(/.test(value)) return true;
    const alpha = cssColor.colorToRgb(value)[3];
    return !(Number.isFinite(alpha) && alpha > 0);
  }
  if (prop === "font-size") return /^(?:0+|0*\.0+)(?:[a-z]+|%)?$/.test(value);
  if (prop === "filter") return /\bopacity\(\s*0+(?:\.0+)?%?\s*\)/.test(value);
  return false;
}

/** Approximate selectors with a superset of their subjects. A rule may remove evidence under any media or state. */
function hidingSelectors(styles: Iterable<ReturnType<typeof parseCss>>, remaining: () => number): Matches[] {
  const hidden = new Map<string, Matches>();
  const generated = /^(?:before|after|marker|placeholder|backdrop|selection|file-selector-button|-webkit-scrollbar(?:-[a-z-]+)?)$/i;
  function selectors(tokens: CSSToken[], depth = 0): Matches {
    if (depth > 12) throw new Error("Publisher selector nesting exceeds bounds");
    const alternatives: Matches[] = [];
    let chain: { tests: Matches[]; child: boolean }[] = [], checks: Matches[] = [];
    let generatedOnly = false, separate = false, child = false, selectorStarted = false;
    const flush = () => {
      if (!selectorStarted) throw new Error("Missing publisher selector");
      const ancestors = chain.reverse(), subject = checks;
      if (!generatedOnly) alternatives.push(element => {
        if (!subject.every(matches => matches(element))) return false;
        let candidates = [element];
        for (const step of ancestors) {
          const seen = new Set<HtmlElement>();
          for (const candidate of candidates) {
            for (let node = parentElement(candidate); node && !seen.has(node); node = parentElement(node)) {
              seen.add(node);
              if (step.child) break;
            }
          }
          candidates = [...seen].filter(node => step.tests.every(matches => matches(node)));
          if (!candidates.length) return false;
        }
        return true;
      });
      chain = []; checks = []; generatedOnly = false; separate = false; child = false; selectorStarted = false;
    };
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (blank(token)) { separate = selectorStarted; continue; }
      if (token[0] === TokenType.Comma) { flush(); continue; }
      if (token[0] === TokenType.Delim && /^[>+~]$/.test(token[1])) {
        // A sibling relationship gives no ancestor constraint.
        if (token[1] === ">") { separate = true; child = true; }
        else { chain = []; checks = []; separate = false; child = false; selectorStarted = false; }
        continue;
      }
      if (separate) { chain.push({ tests: checks, child }); checks = []; separate = false; child = false; }
      selectorStarted = true;
      if (token[0] === TokenType.Ident) {
        const tag = token[4].value.toLowerCase();
        checks.push(element => element.tagName.toLowerCase() === tag);
      } else if (token[0] === TokenType.Hash) {
        const id = token[4].value.toLowerCase();
        checks.push(element => attr(element, "id")?.toLowerCase() === id);
      } else if (token[0] === TokenType.Delim && token[1] === ".") {
        const ident = tokens[++i];
        if (ident?.[0] !== TokenType.Ident) throw new Error("Unsupported publisher class selector");
        const name = ident[4].value.toLowerCase();
        checks.push(element => (attr(element, "class") ?? "").toLowerCase().split(/[\t\n\f\r ]+/u).includes(name));
      } else if (token[0] === TokenType.OpenSquare) {
        const end = tokens.findIndex(([kind], index) => index > i && kind === TokenType.CloseSquare);
        const [key, first, second, third] = tokens.slice(i + 1, end).filter(item => !blank(item));
        if (end < 0 || key?.[0] !== TokenType.Ident || (first?.[1] === "|" && second?.[1] !== "=")) {
          throw new Error("Unsupported publisher attribute selector");
        }
        const name = key[4].value.toLowerCase();
        const operator = first?.[1], value = operator === "=" ? second : third;
        const needle = value?.[0] === TokenType.Ident || value?.[0] === TokenType.String ? value[4].value.toLowerCase() : undefined;
        checks.push(element => element.attrs.some(a => {
          if (a.name.toLowerCase() !== name) return false;
          if (needle === undefined) return true;
          const haystack = a.value.toLowerCase();
          switch (operator) {
            case "=": return haystack === needle;
            case "~": return haystack.split(/[\t\n\f\r ]+/u).includes(needle);
            case "|": return haystack === needle || haystack.startsWith(`${needle}-`);
            case "^": return haystack.startsWith(needle);
            case "$": return haystack.endsWith(needle);
            case "*": return haystack.includes(needle);
            default: return true;
          }
        }));
        i = end;
      } else if (token[0] === TokenType.Colon) {
        const pseudoElement = tokens[i + 1]?.[0] === TokenType.Colon;
        if (pseudoElement) i++;
        const pseudo = tokens[++i];
        if (pseudo?.[0] === TokenType.Ident) {
          const name = pseudo[4].value.toLowerCase();
          if (generated.test(name)) generatedOnly = true;
          else if (!pseudoElement && name === "root") checks.push(element => element.parentNode?.nodeName === "#document");
          else if (!pseudoElement && name === "empty") checks.push(element => !element.childNodes.some(
            child => isElement(child) || ("value" in child && child.value.trim().length > 0)));
        } else if (pseudo?.[0] === TokenType.Function) {
          const start = i + 1;
          let nesting = 1;
          while (++i < tokens.length && nesting) {
            const kind = tokens[i]![0];
            if (kind === TokenType.Function || kind === TokenType.OpenParen) nesting++;
            if (kind === TokenType.CloseParen && --nesting === 0) break;
          }
          if (nesting) throw new Error("Unclosed publisher selector function");
          if (/^(?:is|where|matches|-webkit-any)$/i.test(pseudo[4].value)) checks.push(selectors(tokens.slice(start, i), depth + 1));
        } else throw new Error("Unsupported publisher pseudo selector");
      } else if (token[0] !== TokenType.Delim || !/^[*&]$/.test(token[1])) {
        throw new Error("Unsupported publisher selector");
      }
    }
    flush();
    return element => alternatives.some(matches => matches(element));
  }
  for (const css of styles) {
    remaining();
    css.walkDecls(decl => {
      if (!conceals(decl)) return;
      let rule: Extract<NonNullable<Declaration["parent"]>, { type: "rule" }> | undefined;
      for (let parent = decl.parent; parent && parent.type !== "root"; parent = parent.parent) {
        // Keyframes have no DOM selector. Elements that apply an animation are omitted above.
        if (parent.type === "rule") rule ??= parent;
        else if (parent.type === "atrule") {
          const name = cssTokens(`@${parent.name}`)[0];
          if (name?.[0] === TokenType.AtKeyword && /^(?:-webkit-)?keyframes$/i.test(name[4].value)) return;
          if (name?.[0] !== TokenType.AtKeyword || !/^(?:media|supports|layer|container|scope|starting-style)$/i.test(name[4].value)) {
            throw new Error("Unsupported publisher hiding rule");
          }
        }
      }
      if (!rule) throw new Error("Unsupported publisher hiding declaration");
      for (const selector of rule.selectors) {
        if (hidden.has(selector)) continue;
        if (hidden.size >= MAX_HIDING_SELECTORS || selector.length > 1024) throw new Error("Publisher hiding selector exceeds bounds");
        hidden.set(selector, selectors(cssTokens(selector)));
      }
    });
  }
  return [...hidden.values()];
}

export async function publisherBlocks(body: string, url: string, read: (url: string) => Promise<{ body: string; url: string }>,
  remaining: () => number): Promise<{ title: string; blocks: string[] }> {
  if (!/<(?:[a-z][\w:-]*[\s/>]|!|\/[a-z]|\?)/i.test(body)) {
    const blocks = body.split(/\r?\n/u).map(clean).filter(Boolean);
    return { title: blocks[0] ?? "", blocks };
  }
  const html = children(parse(body, { scriptingEnabled: false })).find(isElement);
  const head = html?.childNodes.find(node => isElement(node) && node.tagName === "head");
  const content = html?.childNodes.find(node => isElement(node) && node.tagName === "body");
  const titleNode = head && children(head).find(node => isElement(node) && node.tagName === "title");
  const styles: ReturnType<typeof parseCss>[] = [], links: string[] = [];
  const blocks: string[] = [], mainBlocks: string[] = [];
  let nodes = 0, pending = "", baseHref: string | undefined;
  const cssType = (element: HtmlElement) => /^(?:text\/css)?$/i.test((attr(element, "type") ?? "").split(";", 1)[0]!.trim());
  function collectStyles(node: HtmlNode, depth: number) {
    if (++nodes > 8000 || depth > 80) throw new Error("Publisher document too complex");
    if (isElement(node)) {
      if (node.tagName === "style" && cssType(node)) styles.push(parseCss(rawText(node)));
      if (node.tagName === "base") baseHref ??= attr(node, "href");
      if (node.tagName === "link" && cssType(node) && attr(node, "rel")?.toLowerCase().split(/[\t\n\f\r ]+/u).includes("stylesheet")) {
        const href = attr(node, "href")?.trim();
        if (!href) throw new Error("Missing publisher stylesheet URL");
        links.push(href);
      }
    }
    for (const child of children(node)) collectStyles(child, depth + 1);
  }
  if (html) collectStyles(html, 0);
  const base = baseHref ? publisherUrl(baseHref.trim(), url) : url;
  const external = new Set<string>();
  function addStyle(href: string, relativeTo: string | null) {
    const uri = relativeTo && publisherUrl(href, relativeTo);
    if (!uri) throw new Error("Unsupported publisher stylesheet URL");
    if (external.has(uri)) return;
    if (external.size >= MAX_STYLESHEETS) throw new Error("Too many publisher stylesheets");
    external.add(uri);
  }
  function imports(css: ReturnType<typeof parseCss>, relativeTo: string | null) {
    css.walkAtRules(rule => {
      if (rule.name.toLowerCase() !== "import" && !rule.name.includes("\\")) return;
      const keyword = cssTokens(`@${rule.name}`)[0];
      if (keyword?.[0] !== TokenType.AtKeyword || keyword[4].value.toLowerCase() !== "import") {
        throw new Error("Unsupported publisher stylesheet at-rule");
      }
      const [ref, arg, close] = cssTokens(rule.params).filter(token => !blank(token));
      const source = ref?.[0] === TokenType.String || ref?.[0] === TokenType.URL ? ref[4].value
        : ref?.[0] === TokenType.Function && ref[4].value.toLowerCase() === "url"
          && arg?.[0] === TokenType.String && close?.[0] === TokenType.CloseParen ? arg[4].value : null;
      if (!source || rule.nodes) throw new Error("Unsupported publisher stylesheet import");
      addStyle(source, relativeTo);
    });
  }
  for (const link of links) addStyle(link, base);
  for (const style of styles) imports(style, base);
  // Sequential loading makes the reader's existing global concurrency limit cover every connection.
  for (const href of external) {
    const resource = await read(href);
    if (resource.body.trimStart().startsWith("<")) throw new Error("Invalid publisher stylesheet");
    const css = parseCss(resource.body);
    if (css.nodes.some(node => node.type === "decl")) throw new Error("Invalid publisher stylesheet");
    imports(css, resource.url);
    styles.push(css);
  }
  const hidden = hidingSelectors(styles, remaining);
  const flush = (inMain: boolean) => {
    const block = clean(pending);
    if (block) (inMain ? mainBlocks : blocks).push(block);
    pending = "";
  };
  function concealed(node: HtmlElement) {
    const style = attr(node, "style");
    return OMIT.has(node.tagName) || attr(node, "hidden") !== undefined || attr(node, "inert") !== undefined
      || attr(node, "aria-hidden")?.trim().toLowerCase() === "true" || /^(?:navigation|banner|contentinfo|complementary)$/i.test(attr(node, "role") ?? "")
      || hidden.some(matches => matches(node))
      || (style && parseCss(style).nodes.some(item => item.type !== "comment" && (item.type !== "decl" || conceals(item))));
  }
  function visible(node: HtmlNode, inMain: boolean) {
    if ("value" in node) { pending += node.value; return; }
    if (!isElement(node)) return;
    remaining();
    if (concealed(node)) {
      flush(inMain);
      return;
    }
    const useMain = inMain || node.tagName === "main" || node.tagName === "article" || attr(node, "role") === "main";
    const block = BLOCK.has(node.tagName) || useMain !== inMain;
    if (block) flush(inMain);
    for (const child of node.childNodes) visible(child, useMain);
    if (block) flush(useMain);
  }
  if (html && content && !concealed(html)) visible(content, false);
  flush(false);
  const passages = mainBlocks.length ? mainBlocks : blocks;
  return { title: (titleNode ? clean(rawText(titleNode)) : "") || passages[0] || "", blocks: passages };
}

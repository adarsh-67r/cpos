import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import { crosshairCursor, drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, rectangularSelection } from "@codemirror/view";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { tags as t } from "@lezer/highlight";

const CPP_WORDS = "alignas alignof auto bool break case catch char class const constexpr continue decltype default delete do double else enum explicit extern false float for friend goto if inline int long namespace new noexcept nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while vector string pair map unordered_map set unordered_set multiset queue priority_queue stack deque array tuple bitset sort stable_sort reverse lower_bound upper_bound binary_search max min abs gcd lcm push_back pop_back emplace_back begin end size empty clear resize assign insert erase find count cin cout cerr endl ios sync_with_stdio tie".split(" ");
const PY_WORDS = "and as assert async await break class continue def del elif else except False finally for from global if import in input is lambda len list map max min None nonlocal not or pass print range return self set sorted str sum True try tuple while with yield".split(" ");
const JAVA_WORDS = "abstract boolean break byte case catch char class continue default do double else enum extends false final finally float for if implements import int interface long new null package private protected public return short static String StringBuilder System true try void while ArrayList HashMap HashSet Scanner BufferedReader PrintWriter".split(" ");
const JS_WORDS = "async await break case catch class const continue default delete do else export extends false finally for function if import in instanceof let new null of return static super switch this throw true try typeof undefined var while yield console document window".split(" ");
const cposHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.bool, t.null], color: "var(--ed-kw, #569cd6)", fontWeight: "700" },
  { tag: [t.typeName, t.className, t.standard(t.typeName)], color: "var(--ed-type, #4ec9b0)", fontWeight: "600" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--ed-str, #ce9178)" },
  { tag: [t.number, t.integer, t.float], color: "var(--ed-num, #b5cea8)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--ed-com, #6a9955)", fontStyle: "italic" },
  { tag: [t.meta, t.processingInstruction, t.definitionKeyword], color: "var(--ed-pre, #c586c0)", fontWeight: "600" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: "var(--ed-fn, #dcdcaa)" },
  { tag: [t.variableName, t.propertyName], color: "var(--ed-fg, #d4d4d4)" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "var(--ed-fg, #d4d4d4)" }
]);

function languageFor(lang) {
  switch (lang) {
    case "python":
    case "pypy":
      return python();
    case "java":
      return java();
    case "javascript":
      return javascript();
    case "cpp":
    default:
      return cpp();
  }
}

function wordsFor(lang) {
  if (lang === "python" || lang === "pypy") return PY_WORDS;
  if (lang === "java") return JAVA_WORDS;
  if (lang === "javascript") return JS_WORDS;
  return CPP_WORDS;
}

function localCompletionSource(langRef) {
  return (context) => {
    const before = context.matchBefore(/[A-Za-z_$][\w$]*/);
    if (!context.explicit && !before) return null;
    const from = before ? before.from : context.pos;
    const doc = context.state.doc.toString();
    const seen = new Set();
    const options = [];
    const add = (label, type = "variable", boost = 0) => {
      if (!label || seen.has(label)) return;
      seen.add(label);
      options.push({ label, type, boost });
    };
    wordsFor(langRef.value).forEach((w) => add(w, /^(vector|string|int|long|double|float|bool|char|String|ArrayList|HashMap)$/.test(w) ? "type" : "keyword", 20));
    doc.replace(/\b[A-Za-z_$][\w$]*\b/g, (w) => {
      if (w.length > 1) add(w, "variable", 5);
      return w;
    });
    return { from, options, validFor: /^[A-Za-z_$][\w$]*$/ };
  };
}

function editorTheme(fontSize) {
  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "var(--ed-bg, #1e1e1e)",
      color: "var(--ed-fg, #d4d4d4)",
      fontSize: `${fontSize}px`
    },
    ".cm-scroller": {
      fontFamily: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      lineHeight: "1.55",
      overflow: "auto"
    },
    ".cm-content": {
      padding: "12px 14px",
      caretColor: "var(--ed-caret, #aeafad)",
      minHeight: "100%"
    },
    ".cm-line": {
      padding: "0 2px"
    },
    ".cm-gutters": {
      backgroundColor: "var(--ed-bg, #1e1e1e)",
      color: "var(--ed-gutter, #858585)",
      borderRight: "1px solid var(--ed-border, #333)"
    },
    ".cm-activeLine": {
      backgroundColor: "var(--ed-line, #ffffff0d)"
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--ed-line, #ffffff0d)",
      color: "var(--ed-fg, #d4d4d4)"
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--ed-sel, #264f7855)"
    },
    "&.cm-focused": {
      outline: "none"
    },
    ".cm-tooltip": {
      backgroundColor: "var(--ed-panel, #252526)",
      color: "var(--ed-fg, #d4d4d4)",
      border: "1px solid var(--ed-border, #333)",
      borderRadius: "8px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.25)"
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "color-mix(in srgb, var(--ed-caret, #aeafad) 22%, transparent)",
      color: "var(--ed-fg, #d4d4d4)"
    }
  }, { dark: true });
}

function wrapExtension(on) {
  return on ? EditorView.lineWrapping : [];
}

function createEditor(parent, opts) {
  const langRef = { value: opts.lang || "cpp" };
  const langComp = new Compartment();
  const wrapComp = new Compartment();
  const themeComp = new Compartment();
  const completionComp = new Compartment();
  const updateListener = EditorView.updateListener.of((u) => {
    if (u.docChanged) opts.onChange?.(u.state.doc.toString());
    if (u.docChanged || u.selectionSet) {
      const head = u.state.selection.main.head;
      const line = u.state.doc.lineAt(head);
      opts.onCursor?.(line.number, head - line.from + 1, u.state.doc.toString());
    }
  });

  const state = EditorState.create({
    doc: opts.value || "",
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
      history(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      crosshairCursor(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      syntaxHighlighting(cposHighlightStyle, { fallback: true }),
      keymap.of([
        indentWithTab,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap
      ]),
      langComp.of(languageFor(langRef.value)),
      wrapComp.of(wrapExtension(!!opts.wrap)),
      themeComp.of(editorTheme(opts.fontSize || 15)),
      completionComp.of(autocompletion({
        override: [localCompletionSource(langRef)],
        activateOnTyping: true,
        maxRenderedOptions: 80
      })),
      updateListener
    ]
  });

  const view = new EditorView({ state, parent });
  const dispatchText = (from, to, insert, selectAt) => {
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: selectAt == null ? from + insert.length : selectAt },
      scrollIntoView: true
    });
    view.focus();
  };

  return {
    el: view.dom,
    getValue: () => view.state.doc.toString(),
    setValue: (value) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value || "" },
        selection: { anchor: 0 },
        scrollIntoView: true
      });
    },
    setLang: (lang) => {
      langRef.value = lang || "cpp";
      view.dispatch({
        effects: [
          langComp.reconfigure(languageFor(langRef.value)),
          completionComp.reconfigure(autocompletion({
            override: [localCompletionSource(langRef)],
            activateOnTyping: true,
            maxRenderedOptions: 80
          }))
        ]
      });
    },
    setWrap: (on) => view.dispatch({ effects: wrapComp.reconfigure(wrapExtension(!!on)) }),
    setFontSize: (px) => view.dispatch({ effects: themeComp.reconfigure(editorTheme(px || 15)) }),
    focus: () => view.focus(),
    select: (start, end) => {
      view.dispatch({ selection: { anchor: start, head: end }, scrollIntoView: true });
      view.focus();
    },
    replaceRange: dispatchText,
    cursorPos: () => view.state.selection.main.head,
    selectedText: () => {
      const r = view.state.selection.main;
      return view.state.sliceDoc(r.from, r.to);
    },
    destroy: () => view.destroy()
  };
}

self.CPOS_CM = { createEditor };

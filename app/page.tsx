"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

const LINJA_PONA_DEFAULT_TEXT = `tenpo+sike mute ale mute wan la jan [_sona_olin_nasin_jan_awen] li lon e toki+pona
jan [_sona] li jan+lawa pi+toki+pona
jan mute pi++ma ale li toki kepeken ona`;
const LINJA_LIPAMANKA_DEFAULT_TEXT = `tenpo+sike mute ale mute wan la jan [sonaolinnasinjanawen] li lon e toki pona
jan [sona] li jan lawa pi toki pona
jan mute pi maale li toki kepeken ona`;

const SITELEN_FONT_SIZE_STORAGE_KEY = "sitelen-font-size";
const SITELEN_FONT_STORAGE_KEY = "sitelen-font";
const THEME_STORAGE_KEY = "sitelen-theme";
const TEXT_STORAGE_KEY = "sitelen-text";
const SITELEN_FONT_SIZE_DEFAULT = 40;
const SITELEN_FONT_SIZE_MIN = 1;
const SITELEN_FONT_SIZE_MAX = 100;
const SITELEN_LINE_HEIGHT = 1.16;
const PNG_CAPTURE_ANIMATION_MS = 900;
const PNG_CAPTURE_CLEAR_DELAY_MS = PNG_CAPTURE_ANIMATION_MS + 40;
const PNG_EXPORT_SCALE_MULTIPLIER = 2;
const PNG_CAPTURE_PADDING_BOTTOM = 0;
const PNG_CAPTURE_PADDING_LEFT = 10;
const PNG_CAPTURE_PADDING_RIGHT = 10;
const PNG_CAPTURE_PADDING_TOP = 6;
const SINGLE_GLYPH_FILTER_FONT_SIZE = 64;
const SINGLE_GLYPH_WIDTH_TOLERANCE = 1.35;

type CopyState = "idle" | "copied" | "downloaded" | "error";
type Definitions = Record<string, string>;
type SitelenFontKey = "linja-pona" | "linja-lipamanka";
type Theme = "dark" | "light";
type CursorWord = {
  cursor: number;
  end: number;
  glyphEnd: number;
  glyphStart: number;
  start: number;
  word: string;
};
type CaptureAnimation = {
  height: number;
  style: CSSProperties;
  width: number;
};
type AutocompletePosition = {
  left: number;
  top: number;
};
type SitelenFont = {
  key: SitelenFontKey;
  label: string;
  family: string;
  className: string;
};

const SITELEN_FONTS = [
  {
    key: "linja-pona",
    label: "linja pona",
    family: '"Linja Pona"',
    className: "sitelen-pona--linja-pona",
  },
  {
    key: "linja-lipamanka",
    label: "linja lipamanka",
    family: '"Linja Lipamanka"',
    className: "sitelen-pona--linja-lipamanka",
  },
] as const satisfies readonly SitelenFont[];

const DEFAULT_SITELEN_FONT = SITELEN_FONTS[0];

function getSitelenFont(key: string | null): SitelenFont {
  return (
    SITELEN_FONTS.find((font) => font.key === key) ?? DEFAULT_SITELEN_FONT
  );
}

function getDefaultText(sitelenFont: SitelenFont) {
  return sitelenFont.key === "linja-lipamanka"
    ? LINJA_LIPAMANKA_DEFAULT_TEXT
    : LINJA_PONA_DEFAULT_TEXT;
}

function getCopyStateText(copyState: CopyState, sitelenFont: SitelenFont) {
  if (copyState === "copied") {
    return "sitelen li lon poki+tu"
      
  }

  return "sitelen li kama";
}

function getSavedFontSize() {
  if (typeof window === "undefined") {
    return SITELEN_FONT_SIZE_DEFAULT;
  }

  const savedFontSize = window.localStorage.getItem(
    SITELEN_FONT_SIZE_STORAGE_KEY,
  );
  const parsedFontSize = savedFontSize ? Number(savedFontSize) : NaN;

  if (
    Number.isFinite(parsedFontSize) &&
    parsedFontSize >= SITELEN_FONT_SIZE_MIN &&
    parsedFontSize <= SITELEN_FONT_SIZE_MAX
  ) {
    return parsedFontSize;
  }

  return SITELEN_FONT_SIZE_DEFAULT;
}

function getSavedTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark"
    ? "dark"
    : "light";
}

function getSavedSitelenFont(): SitelenFont {
  if (typeof window === "undefined") {
    return DEFAULT_SITELEN_FONT;
  }

  return getSitelenFont(window.localStorage.getItem(SITELEN_FONT_STORAGE_KEY));
}

function getSavedText(sitelenFont: SitelenFont) {
  if (typeof window === "undefined") {
    return getDefaultText(sitelenFont);
  }

  return window.localStorage.getItem(TEXT_STORAGE_KEY) ?? getDefaultText(sitelenFont);
}

function formatTokiPonaCount(value: number) {
  const parts: string[] = [];
  let remaining = Math.max(0, Math.floor(value));

  for (const [word, amount] of [
    ["ale", 100],
    ["mute", 20],
    ["luka", 5],
    ["tu", 2],
    ["wan", 1],
  ] as const) {
    while (remaining >= amount) {
      parts.push(word);
      remaining -= amount;
    }
  }

  return parts.join(" ");
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const lines: string[] = [];

  for (const paragraph of text.split(/\n/)) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    const words = paragraph.split(/\s+/);
    let line = "";

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;

      if (context.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }

    lines.push(line);
  }

  return lines;
}

function getWordAtCursor(value: string, cursor: number): CursorWord {
  let start = cursor;
  let end = cursor;
  let glyphStart = cursor;
  let glyphEnd = cursor;

  while (start > 0 && /[a-z]/i.test(value[start - 1])) {
    start -= 1;
  }

  while (end < value.length && /[a-z]/i.test(value[end])) {
    end += 1;
  }

  while (glyphStart > 0 && /[a-z+-]/i.test(value[glyphStart - 1])) {
    glyphStart -= 1;
  }

  while (glyphEnd < value.length && /[a-z+-]/i.test(value[glyphEnd])) {
    glyphEnd += 1;
  }

  return {
    cursor,
    end,
    glyphEnd,
    glyphStart,
    start,
    word: value.slice(start, end).toLowerCase(),
  };
}

function getLastWordBeforeCursor(value: string, cursor: number) {
  let end = cursor;

  while (end > 0 && !/[a-z]/i.test(value[end - 1])) {
    end -= 1;
  }

  let start = end;

  while (start > 0 && /[a-z]/i.test(value[start - 1])) {
    start -= 1;
  }

  return value.slice(start, end).toLowerCase();
}

function emptyCursorWord(): CursorWord {
  return {
    cursor: 0,
    end: 0,
    glyphEnd: 0,
    glyphStart: 0,
    start: 0,
    word: "",
  };
}

function getDictionaryMatches(definitions: Definitions, word: string) {
  if (!word) {
    return [];
  }

  return Object.keys(definitions)
    .filter((definitionWord) => definitionWord.startsWith(word))
    .sort((a, b) => a.localeCompare(b));
}

async function filterSingleGlyphDefinitions(definitions: Definitions) {
  if (typeof document === "undefined") {
    return definitions;
  }

  if ("fonts" in document) {
    await document.fonts.load(`${SINGLE_GLYPH_FILTER_FONT_SIZE}px "Linja Pona"`);
    await document.fonts.ready;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return definitions;
  }

  context.font = `${SINGLE_GLYPH_FILTER_FONT_SIZE}px "Linja Pona", sans-serif`;

  const referenceGlyphWidth = Math.max(
    context.measureText("a").width,
    context.measureText("toki").width,
    context.measureText("pona").width,
  );
  const maxSingleGlyphWidth =
    referenceGlyphWidth * SINGLE_GLYPH_WIDTH_TOLERANCE;

  return Object.fromEntries(
    Object.entries(definitions).filter(([word]) => {
      const width = context.measureText(word).width;

      return width > 0 && width <= maxSingleGlyphWidth;
    }),
  );
}

function getTextareaTextPosition(
  element: HTMLTextAreaElement,
  textIndex: number,
) {
  const computed = window.getComputedStyle(element);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  const properties = [
    "borderBottomWidth",
    "borderLeftWidth",
    "borderRightWidth",
    "borderTopWidth",
    "boxSizing",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
    "paddingBottom",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "textTransform",
    "width",
  ] as const;

  for (const property of properties) {
    mirror.style[property] = computed[property];
  }

  mirror.style.left = `${element.getBoundingClientRect().left}px`;
  mirror.style.minHeight = "0";
  mirror.style.overflow = "hidden";
  mirror.style.position = "fixed";
  mirror.style.top = `${element.getBoundingClientRect().top}px`;
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordBreak = "break-word";
  mirror.textContent = element.value.slice(0, textIndex);
  marker.textContent = "\u200b";
  mirror.append(marker);
  document.body.append(mirror);

  const textareaRect = element.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const position = {
    left: markerRect.left - textareaRect.left - element.scrollLeft,
    top: markerRect.top - textareaRect.top - element.scrollTop,
  };

  mirror.remove();

  return position;
}

function renderSitelenText(text: string, cursorWord: CursorWord, theme: Theme) {
  if (cursorWord.glyphStart === cursorWord.glyphEnd) {
    return text || " ";
  }

  return (
    <>
      {text.slice(0, cursorWord.glyphStart)}
      <span
        className={
          theme === "dark"
            ? "bg-[#0f766e] text-white"
            : "bg-[#99f6e4] text-black"
        }
      >
        {text.slice(cursorWord.glyphStart, cursorWord.glyphEnd)}
      </span>
      {text.slice(cursorWord.glyphEnd) || " "}
    </>
  );
}

const PNG_CAPTURE_PADDING_STYLE = {
  paddingBottom: PNG_CAPTURE_PADDING_BOTTOM,
  paddingLeft: PNG_CAPTURE_PADDING_LEFT,
  paddingRight: PNG_CAPTURE_PADDING_RIGHT,
  paddingTop: PNG_CAPTURE_PADDING_TOP,
} satisfies CSSProperties;

export default function Home() {
  const [text, setText] = useState(getDefaultText(DEFAULT_SITELEN_FONT));
  const [fontSize, setFontSize] = useState(SITELEN_FONT_SIZE_DEFAULT);
  const [sitelenFont, setSitelenFont] =
    useState<SitelenFont>(DEFAULT_SITELEN_FONT);
  const [theme, setTheme] = useState<Theme>("light");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [captureAnimation, setCaptureAnimation] =
    useState<CaptureAnimation | null>(null);
  const [definitions, setDefinitions] = useState<Definitions>({});
  const [cursorWord, setCursorWord] = useState<CursorWord>(emptyCursorWord);
  const [autocompletePosition, setAutocompletePosition] =
    useState<AutocompletePosition | null>(null);
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState<
    number | null
  >(null);
  const [isTextFocused, setIsTextFocused] = useState(false);
  const pngButtonRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const restoreSavedSettings = window.setTimeout(() => {
      const savedSitelenFont = getSavedSitelenFont();

      setSitelenFont(savedSitelenFont);
      setText(getSavedText(savedSitelenFont));
      setFontSize(getSavedFontSize());
      setTheme(getSavedTheme());
    }, 0);

    return () => {
      window.clearTimeout(restoreSavedSettings);
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    fetch("/api/definitions")
      .then((response) => response.json() as Promise<Definitions>)
      .then((nextDefinitions) => filterSingleGlyphDefinitions(nextDefinitions))
      .then((nextDefinitions) => {
        if (isActive) {
          setDefinitions(nextDefinitions);
        }
      })
      .catch(() => {
        if (isActive) {
          setDefinitions({});
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (copyState !== "copied" && copyState !== "downloaded") {
      return;
    }

    const clearToast = window.setTimeout(() => {
      setCopyState("idle");
    }, 5000);

    return () => {
      window.clearTimeout(clearToast);
    };
  }, [copyState]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [text]);

  function updateAutocompletePosition(
    element: HTMLTextAreaElement,
    nextCursorWord: CursorWord,
  ) {
    if (nextCursorWord.cursor !== nextCursorWord.end || !nextCursorWord.word) {
      setAutocompletePosition(null);
      setSelectedAutocompleteIndex(null);
      return;
    }

    const textPosition = getTextareaTextPosition(element, nextCursorWord.start);
    const lineHeight = Number.parseFloat(
      window.getComputedStyle(element).lineHeight,
    );

    setAutocompletePosition({
      left: textPosition.left,
      top: textPosition.top + (Number.isFinite(lineHeight) ? lineHeight : 32),
    });
  }

  function updateCursorWord(element: HTMLTextAreaElement) {
    const nextCursorWord = getWordAtCursor(
      element.value,
      element.selectionStart,
    );

    setCursorWord(nextCursorWord);
    updateAutocompletePosition(element, nextCursorWord);
  }

  function updateFontSize(value: number) {
    setFontSize(value);
    setCopyState("idle");
    window.localStorage.setItem(SITELEN_FONT_SIZE_STORAGE_KEY, String(value));
  }

  function updateSitelenFont(nextFont: SitelenFont) {
    const nextDefaultText = getDefaultText(nextFont);

    if (text === getDefaultText(sitelenFont)) {
      setText(nextDefaultText);
      window.localStorage.setItem(TEXT_STORAGE_KEY, nextDefaultText);
    }

    setSitelenFont(nextFont);
    setCopyState("idle");
    window.localStorage.setItem(SITELEN_FONT_STORAGE_KEY, nextFont.key);
  }

  function updateText(value: string) {
    setText(value);
    setCopyState("idle");
    window.localStorage.setItem(TEXT_STORAGE_KEY, value);
  }

  function resetText() {
    updateText(getDefaultText(sitelenFont));
    setCursorWord(emptyCursorWord());
    setAutocompletePosition(null);
    setSelectedAutocompleteIndex(null);
  }

  function updateTextFromTextarea(element: HTMLTextAreaElement) {
    const nextText = element.value;
    const selectionStart = element.selectionStart;
    const selectionEnd = element.selectionEnd;
    const nextCursorWord = getWordAtCursor(nextText, selectionStart);
    const dictionaryMatches = getDictionaryMatches(
      definitions,
      nextCursorWord.word,
    );
    const isTypingForward = nextText.length > text.length;
    const shouldAutoInsert =
      isTypingForward &&
      selectionStart === selectionEnd &&
      selectionStart === nextCursorWord.end &&
      dictionaryMatches.length === 1 &&
      dictionaryMatches[0] !== nextCursorWord.word;

    if (!shouldAutoInsert) {
      updateText(nextText);
      setCursorWord(nextCursorWord);
      updateAutocompletePosition(element, nextCursorWord);
      setSelectedAutocompleteIndex(null);
      return;
    }

    const completedWord = dictionaryMatches[0];
    insertAutocompleteWord(completedWord, nextText, nextCursorWord);
  }

  function insertAutocompleteWord(
    completedWord: string,
    sourceText = text,
    sourceCursorWord = cursorWord,
  ) {
    const completedText = `${sourceText.slice(
      0,
      sourceCursorWord.start,
    )}${completedWord}${sourceText.slice(sourceCursorWord.end)}`;
    const completedCursor = sourceCursorWord.start + completedWord.length;

    updateText(completedText);
    setCursorWord(getWordAtCursor(completedText, completedCursor));
    setAutocompletePosition(null);
    setSelectedAutocompleteIndex(null);

    window.requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(completedCursor, completedCursor);
    });
  }

  function toggleTheme() {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);

      return nextTheme;
    });
  }

  function animatePngCapture() {
    const preview = previewRef.current;
    const pngButton = pngButtonRef.current;

    if (!preview || !pngButton) {
      return Promise.resolve();
    }

    const previewRect = preview.getBoundingClientRect();
    const buttonRect = pngButton.getBoundingClientRect();
    const targetScale = 0;
    const targetX =
      buttonRect.left +
      buttonRect.width / 2 -
      previewRect.left -
      (previewRect.width * targetScale) / 2;
    const targetY =
      buttonRect.top +
      buttonRect.height / 2 -
      previewRect.top -
      (previewRect.height * targetScale) / 2;

    setCaptureAnimation({
      height: previewRect.height,
      width: previewRect.width,
      style: {
        "--png-capture-x": `${targetX}px`,
        "--png-capture-y": `${targetY}px`,
        fontSize,
        left: previewRect.left,
        lineHeight: SITELEN_LINE_HEIGHT,
        top: previewRect.top,
      } as CSSProperties,
    });

    return new Promise<void>((resolve) => {
      window.setTimeout(() => {
        resolve();
      }, PNG_CAPTURE_ANIMATION_MS);
      window.setTimeout(() => {
        setCaptureAnimation(null);
      }, PNG_CAPTURE_CLEAR_DELAY_MS);
    });
  }

  async function createPngBlob(
    preview: HTMLDivElement,
    textToExport: string,
    exportedFont: SitelenFont,
  ) {
    const computed = window.getComputedStyle(preview);
    const rect = preview.getBoundingClientRect();
    const scale =
      Math.max(2, window.devicePixelRatio || 1) *
      PNG_EXPORT_SCALE_MULTIPLIER;
    const maxTextWidth = Math.max(
      1,
      Math.ceil(
        rect.width - PNG_CAPTURE_PADDING_LEFT - PNG_CAPTURE_PADDING_RIGHT,
      ),
    );
    const renderedFontSize =
      Number.parseFloat(computed.fontSize) || SITELEN_FONT_SIZE_DEFAULT;
    const lineHeight = renderedFontSize * SITELEN_LINE_HEIGHT;

    if ("fonts" in document) {
      await document.fonts.load(
        `${renderedFontSize * scale}px ${exportedFont.family}`,
      );
      await document.fonts.ready;
    }

    const measureCanvas = document.createElement("canvas");
    const measureContext = measureCanvas.getContext("2d");

    if (!measureContext) {
      throw new Error("Could not create canvas context.");
    }

    measureContext.font =
      `${renderedFontSize}px ${exportedFont.family}, sans-serif`;
    const lines = wrapCanvasText(measureContext, textToExport, maxTextWidth);
    const textWidth = Math.max(
      1,
      ...lines.map((line) => Math.ceil(measureContext.measureText(line).width)),
    );
    const width = Math.ceil(
      PNG_CAPTURE_PADDING_LEFT + textWidth + PNG_CAPTURE_PADDING_RIGHT,
    );
    const height = Math.ceil(
      PNG_CAPTURE_PADDING_TOP +
        lines.length * lineHeight +
        PNG_CAPTURE_PADDING_BOTTOM,
    );

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create canvas context.");
    }

    context.scale(scale, scale);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = computed.backgroundColor || "#fffdf8";
    context.fillRect(0, 0, width, height);
    context.fillStyle = computed.color || "#15130e";
    context.font = `${renderedFontSize}px ${exportedFont.family}, sans-serif`;
    context.textBaseline = "top";
    context.textRendering = "optimizeLegibility";

    lines.forEach((line, index) => {
      context.fillText(
        line,
        PNG_CAPTURE_PADDING_LEFT,
        PNG_CAPTURE_PADDING_TOP + index * lineHeight,
      );
    });

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("Could not create PNG."));
        }
      }, "image/png");
    });
  }

  async function copyPng() {
    const preview = previewRef.current;

    if (!preview) {
      return;
    }

    try {
      setCopyState("idle");
      const captureAnimationFinished = animatePngCapture();
      const pngBlob = Promise.resolve().then(() =>
        createPngBlob(preview, text, sitelenFont),
      );

      if (navigator.clipboard && "ClipboardItem" in window) {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": pngBlob }),
        ]);
        await captureAnimationFinished;
        setCopyState("copied");
        return;
      }

      const blob = await pngBlob;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "sitelen-toki.png";
      link.click();
      URL.revokeObjectURL(link.href);
      await captureAnimationFinished;
      setCopyState("downloaded");
    } catch (error) {
      console.error(error);
      setCopyState("error");
    }
  }

  const definitionWord =
    cursorWord.word || getLastWordBeforeCursor(text, cursorWord.cursor);
  const cursorDefinition = definitions[definitionWord];
  const autocompleteMatches =
    isTextFocused &&
    autocompletePosition &&
    cursorWord.cursor === cursorWord.end
      ? getDictionaryMatches(definitions, cursorWord.word)
      : [];
  const autocompleteSuggestions =
    autocompleteMatches.length > 1 ? autocompleteMatches.slice(0, 6) : [];
  const currentAutocompleteIndex = autocompleteSuggestions.length
    ? Math.min(
        selectedAutocompleteIndex ?? 0,
        autocompleteSuggestions.length - 1,
      )
    : null;

  function handleAutocompleteKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.defaultPrevented) {
      return;
    }

    const element = event.currentTarget;
    const eventCursorWord = getWordAtCursor(
      element.value,
      element.selectionStart,
    );
    const eventSuggestions =
      eventCursorWord.cursor === eventCursorWord.end
        ? getDictionaryMatches(definitions, eventCursorWord.word).slice(0, 6)
        : [];

    const isArrowDown =
      event.key === "ArrowDown" ||
      event.key === "Down" ||
      event.code === "ArrowDown";
    const isArrowUp =
      event.key === "ArrowUp" || event.key === "Up" || event.code === "ArrowUp";
    const isAcceptKey = event.key === "Enter" || event.key === "Tab";

    if (eventSuggestions.length <= 1) {
      return;
    }

    if (isArrowDown || isArrowUp) {
      event.preventDefault();
      event.stopPropagation();
      setCursorWord(eventCursorWord);
      updateAutocompletePosition(element, eventCursorWord);
      setSelectedAutocompleteIndex((currentIndex) => {
        if (currentIndex === null) {
          return isArrowDown ? 1 : eventSuggestions.length - 1;
        }

        const offset = isArrowDown ? 1 : -1;

        return (
          (currentIndex + offset + eventSuggestions.length) %
          eventSuggestions.length
        );
      });
      return;
    }

    if (!isAcceptKey) {
      return;
    }

    const eventSelectedIndex = Math.min(
      selectedAutocompleteIndex ?? 0,
      eventSuggestions.length - 1,
    );
    const selectedSuggestion = eventSuggestions[eventSelectedIndex];

    if (!selectedSuggestion) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    insertAutocompleteWord(selectedSuggestion, element.value, eventCursorWord);
  }

  return (
    <main
      className={
        theme === "dark"
          ? "flex min-h-dvh flex-col bg-black text-white"
          : "flex min-h-dvh flex-col bg-white text-black"
      }
      style={
        {
          "--sitelen-pona-font-family": sitelenFont.family,
        } as CSSProperties
      }
    >
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-5 px-5 py-6 md:px-8">
        <section className="flex min-h-0 flex-col gap-5">
          <label className="flex flex-col gap-3">
            <div className="relative flex">
              <textarea
                className={
                  theme === "dark"
                    ? "min-h-0 w-full resize-none overflow-hidden rounded-lg border border-[#374151] bg-black px-4 py-3 pr-14 text-[20px] leading-8 text-white shadow-sm outline-none focus:border-[#2dd4bf] focus:ring-2 focus:ring-[#134e4a]"
                    : "min-h-0 w-full resize-none overflow-hidden rounded-lg border border-[#d1d5db] bg-white px-4 py-3 pr-14 text-[20px] leading-8 text-black shadow-sm outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                }
                onChange={(event) => {
                  updateTextFromTextarea(event.currentTarget);
                }}
                onBlur={() => {
                  setIsTextFocused(false);
                }}
                onFocus={(event) => {
                  setIsTextFocused(true);
                  updateCursorWord(event.currentTarget);
                }}
                onKeyDown={handleAutocompleteKeyDown}
                onKeyDownCapture={handleAutocompleteKeyDown}
                onKeyUp={(event) => {
                  if (
                    event.key === "ArrowDown" ||
                    event.key === "Down" ||
                    event.key === "ArrowUp" ||
                    event.key === "Up" ||
                    event.key === "Enter" ||
                    event.key === "Tab"
                  ) {
                    return;
                  }

                  updateCursorWord(event.currentTarget);
                }}
                onScroll={(event) => {
                  updateCursorWord(event.currentTarget);
                }}
                onSelect={(event) => {
                  updateCursorWord(event.currentTarget);
                }}
                ref={textareaRef}
                spellCheck={false}
                value={text}
              />
              {autocompleteSuggestions.length > 0 && autocompletePosition ? (
                <div
                  className={
                    theme === "dark"
                      ? "autocomplete-overlay border-[#374151] bg-black text-white shadow-lg"
                      : "autocomplete-overlay border-[#d1d5db] bg-white text-black shadow-lg"
                  }
                  role="listbox"
                  style={{
                    left: autocompletePosition.left,
                    top: autocompletePosition.top,
                  }}
                >
                  {autocompleteSuggestions.map((suggestion, index) => (
                    <button
                      aria-selected={currentAutocompleteIndex === index}
                      className={
                        currentAutocompleteIndex === index
                          ? "autocomplete-overlay__word autocomplete-overlay__word--selected"
                          : "autocomplete-overlay__word"
                      }
                      key={suggestion}
                      onClick={() => {
                        insertAutocompleteWord(suggestion);
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onMouseEnter={() => {
                        setSelectedAutocompleteIndex(index);
                      }}
                      role="option"
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="autocomplete-overlay__glyph sitelen-pona"
                      >
                        {suggestion}
                      </span>
                      <span className="autocomplete-overlay__text">
                        <strong>
                          {suggestion.slice(0, cursorWord.word.length)}
                        </strong>
                        {suggestion.slice(cursorWord.word.length)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                aria-label="o weka e toki"
                className="icon-button textarea-corner-button"
                data-theme={theme}
                onClick={resetText}
                type="button"
              >
                <span aria-hidden="true" className="sitelen-pona text-2xl">
                  weka
                </span>
              </button>
            </div>
            <p
              className={
                theme === "dark"
                  ? "min-h-12 text-[16px] leading-6 text-[#d1d5db]"
                  : "min-h-12 text-[16px] leading-6 text-[#374151]"
              }
            >
              {isTextFocused && definitionWord && cursorDefinition ? (
                <>
                  <span
                    aria-hidden="true"
                    className={
                      theme === "dark"
                        ? "sitelen-pona mr-2 inline-block align-middle text-2xl leading-none text-[#5eead4]"
                        : "sitelen-pona mr-2 inline-block align-middle text-2xl leading-none text-[#0f766e]"
                    }
                  >
                    {definitionWord}
                  </span>
                  <span
                    className={
                      theme === "dark"
                        ? "mr-2 font-semibold text-[#5eead4]"
                        : "mr-2 font-semibold text-[#0f766e]"
                    }
                  >
                    {definitionWord}
                  </span>
                  {cursorDefinition}
                </>
              ) : null}
            </p>
          </label>

          <div className="flex flex-col gap-3">
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
              <label
                className={
                  theme === "dark"
                    ? "flex min-h-11 flex-wrap items-center gap-3 text-sm font-medium text-[#d1d5db]"
                    : "flex min-h-11 flex-wrap items-center gap-3 text-sm font-medium text-[#374151]"
                }
              >
                <span className="sitelen-pona shrink-0 text-2xl leading-none">
                  lili anu suli
                </span>
                <input
                  className={
                    theme === "dark"
                      ? "w-[150px] cursor-pointer accent-[#2dd4bf]"
                      : "w-[150px] cursor-pointer accent-[#0f766e]"
                  }
                  max={SITELEN_FONT_SIZE_MAX}
                  min={SITELEN_FONT_SIZE_MIN}
                  onChange={(event) => {
                    updateFontSize(Number(event.target.value));
                  }}
                  type="range"
                  value={fontSize}
                />
                <span
                  aria-label={`${fontSize}`}
                  className="sitelen-pona min-w-[8ch] shrink text-2xl leading-none"
                >
                  {formatTokiPonaCount(fontSize)}
                </span>
              </label>
              <div
                aria-label="o ante e nasin sitelen"
                className="font-switch"
                data-theme={theme}
                role="group"
              >
                {SITELEN_FONTS.map((font) => (
                  <button
                    aria-label={font.label}
                    aria-pressed={sitelenFont.key === font.key}
                    className="font-switch__button"
                    key={font.key}
                    onClick={() => {
                      updateSitelenFont(font);
                    }}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={`${font.className} font-switch__glyph`}
                    >
                      kijetesantakalu
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div
              ref={previewRef}
              className={
                theme === "dark"
                  ? "sitelen-pona relative whitespace-pre-wrap rounded-lg border border-[#374151] bg-black text-white shadow-sm"
                  : "sitelen-pona relative whitespace-pre-wrap rounded-lg border border-[#d1d5db] bg-white shadow-sm"
              }
              style={{
                fontSize,
                lineHeight: SITELEN_LINE_HEIGHT,
                ...PNG_CAPTURE_PADDING_STYLE,
                paddingBottom: 64,
              }}
            >
              {copyState === "copied" || copyState === "downloaded" ? (
                <p
                  className={
                    theme === "dark"
                      ? "absolute bottom-0 right-0 z-10 flex items-center gap-1 whitespace-nowrap rounded-br-lg rounded-tl-md border-l border-t border-[#4b5563] bg-black px-3 py-2 text-sm font-medium text-white shadow-lg"
                      : "absolute bottom-0 right-0 z-10 flex items-center gap-1 whitespace-nowrap rounded-br-lg rounded-tl-md border-l border-t border-[#d1d5db] bg-white px-3 py-2 text-sm font-medium text-black shadow-lg"
                  }
                >
                  <span className="sitelen-pona text-xl leading-none text-[#0f766e]">
                    {getCopyStateText(copyState, sitelenFont)}
                  </span>
                </p>
              ) : (
                <button
                  className="png-button pane-corner-button z-10 inline-flex items-center gap-1"
                  data-theme={theme}
                  onClick={copyPng}
                  ref={pngButtonRef}
                  type="button"
                >
                  <span className="sitelen-pona text-2xl leading-none">
                    pana
                  </span>
                </button>
              )}
              {isTextFocused
                ? renderSitelenText(text, cursorWord, theme)
                : text || " "}
            </div>
          </div>
        </section>

        {captureAnimation ? (
          <div
            aria-hidden="true"
            className={
              theme === "dark"
                ? "sitelen-pona png-capture-layer whitespace-pre-wrap rounded-lg border border-[#374151] bg-black text-white shadow-sm"
                : "sitelen-pona png-capture-layer whitespace-pre-wrap rounded-lg border border-[#d1d5db] bg-white text-black shadow-sm"
            }
            style={{
              ...captureAnimation.style,
              ...PNG_CAPTURE_PADDING_STYLE,
              height: captureAnimation.height,
              width: captureAnimation.width,
            }}
          >
            {text || " "}
          </div>
        ) : null}
      </div>
      {copyState === "error" ? (
        <p className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-1 px-5 pb-3 text-sm font-medium text-[#b91c1c] md:px-8">
          <span className="sitelen-pona text-xl leading-none">
            pali sitelen li pakala. ken la ilo ni li wile e
          </span>
          <span>HTTPS</span>
          <span className="sitelen-pona text-xl leading-none">anu</span>
          <span>localhost</span>
          <span>.</span>
        </p>
      ) : null}
      <footer className="mt-auto flex shrink-0 items-center justify-between px-5 pb-6 md:px-8">
        <button
          aria-label={theme === "dark" ? "o ante tawa suno" : "o ante tawa mun"}
          aria-pressed={theme === "dark"}
          className="theme-button"
          data-theme={theme}
          onClick={toggleTheme}
          type="button"
        >
          <span aria-hidden="true" className="sitelen-pona theme-button__glyph">
            {theme === "dark" ? "suno" : "mun"}
          </span>
        </button>
        <a
          aria-label="vpavlenko/sitelen"
          className={
            theme === "dark"
              ? "mama-link sitelen-pona text-2xl leading-none text-white"
              : "mama-link sitelen-pona text-2xl leading-none text-black"
          }
          data-theme={theme}
          href="https://github.com/vpavlenko/sitelen"
          rel="noreferrer"
          target="_blank"
        >
          mama
        </a>
      </footer>
    </main>
  );
}

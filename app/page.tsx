"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const DEFAULT_TEXT = `tenpo+sike mute ale mute wan la jan [_sona_olin_nasin_jan_awen] li lon e toki+pona
jan [_sona] li jan+lawa pi+toki+pona
jan mute pi++ma ale li toki kepeken ona`;

const SITELEN_FONT_SIZE_STORAGE_KEY = "sitelen-font-size";
const THEME_STORAGE_KEY = "sitelen-theme";
const TEXT_STORAGE_KEY = "sitelen-text";
const SITELEN_FONT_SIZE_DEFAULT = 40;
const SITELEN_FONT_SIZE_MIN = 1;
const SITELEN_FONT_SIZE_MAX = 100;
const SITELEN_LINE_HEIGHT = 1.16;
const PNG_CAPTURE_ANIMATION_MS = 900;
const PNG_CAPTURE_CLEAR_DELAY_MS = PNG_CAPTURE_ANIMATION_MS + 40;
const PNG_EXPORT_SCALE_MULTIPLIER = 2;
const SINGLE_GLYPH_FILTER_FONT_SIZE = 64;
const SINGLE_GLYPH_WIDTH_TOLERANCE = 1.35;

type CopyState = "idle" | "copied" | "downloaded" | "error";
type Definitions = Record<string, string>;
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

function getSavedText() {
  if (typeof window === "undefined") {
    return DEFAULT_TEXT;
  }

  return window.localStorage.getItem(TEXT_STORAGE_KEY) ?? DEFAULT_TEXT;
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
    await document.fonts.load(
      `${SINGLE_GLYPH_FILTER_FONT_SIZE}px "Linja Pona"`,
    );
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

export default function Home() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [fontSize, setFontSize] = useState(SITELEN_FONT_SIZE_DEFAULT);
  const [theme, setTheme] = useState<Theme>("light");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [captureAnimation, setCaptureAnimation] =
    useState<CaptureAnimation | null>(null);
  const [definitions, setDefinitions] = useState<Definitions>({});
  const [cursorWord, setCursorWord] = useState<CursorWord>(emptyCursorWord);
  const [autocompletePosition, setAutocompletePosition] =
    useState<AutocompletePosition | null>(null);
  const [isTextFocused, setIsTextFocused] = useState(false);
  const pngButtonRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const restoreSavedSettings = window.setTimeout(() => {
      setText(getSavedText());
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

  function updateAutocompletePosition(
    element: HTMLTextAreaElement,
    nextCursorWord: CursorWord,
  ) {
    if (nextCursorWord.cursor !== nextCursorWord.end || !nextCursorWord.word) {
      setAutocompletePosition(null);
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

  function updateText(value: string) {
    setText(value);
    setCopyState("idle");
    window.localStorage.setItem(TEXT_STORAGE_KEY, value);
  }

  function resetText() {
    updateText(DEFAULT_TEXT);
    setCursorWord(emptyCursorWord());
    setAutocompletePosition(null);
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
      return;
    }

    const completedWord = dictionaryMatches[0];
    const completedText = `${nextText.slice(
      0,
      nextCursorWord.start,
    )}${completedWord}${nextText.slice(nextCursorWord.end)}`;
    const completedCursor = nextCursorWord.start + completedWord.length;

    updateText(completedText);
    setCursorWord(getWordAtCursor(completedText, completedCursor));
    setAutocompletePosition(null);

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

  async function createPngBlob(preview: HTMLDivElement, textToExport: string) {
    const computed = window.getComputedStyle(preview);
    const rect = preview.getBoundingClientRect();
    const scale =
      Math.max(2, window.devicePixelRatio || 1) *
      PNG_EXPORT_SCALE_MULTIPLIER;
    const paddingX = Number.parseFloat(computed.paddingLeft) || 32;
    const paddingY = Number.parseFloat(computed.paddingTop) || 32;
    const maxTextWidth = Math.max(1, Math.ceil(rect.width - paddingX * 2));
    const renderedFontSize =
      Number.parseFloat(computed.fontSize) || SITELEN_FONT_SIZE_DEFAULT;
    const lineHeight = renderedFontSize * SITELEN_LINE_HEIGHT;

    if ("fonts" in document) {
      await document.fonts.load(`${renderedFontSize * scale}px "Linja Pona"`);
      await document.fonts.ready;
    }

    const measureCanvas = document.createElement("canvas");
    const measureContext = measureCanvas.getContext("2d");

    if (!measureContext) {
      throw new Error("Could not create canvas context.");
    }

    measureContext.font = `${renderedFontSize}px "Linja Pona", sans-serif`;
    const lines = wrapCanvasText(measureContext, textToExport, maxTextWidth);
    const textWidth = Math.max(
      1,
      ...lines.map((line) => Math.ceil(measureContext.measureText(line).width)),
    );
    const width = Math.ceil(paddingX * 2 + textWidth);
    const height = Math.ceil(paddingY * 2 + lines.length * lineHeight);

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
    context.font = `${renderedFontSize}px "Linja Pona", sans-serif`;
    context.textBaseline = "top";
    context.textRendering = "optimizeLegibility";

    lines.forEach((line, index) => {
      context.fillText(line, paddingX, paddingY + index * lineHeight);
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
      const pngBlob = Promise.resolve().then(() => createPngBlob(preview, text));

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

  return (
    <main
      className={
        theme === "dark"
          ? "min-h-screen bg-black text-white"
          : "min-h-screen bg-white text-black"
      }
    >
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-5 py-6 md:px-8">
        <section className="flex flex-1 flex-col gap-5">
          <label className="flex min-h-[220px] flex-col gap-3">
            <div className="relative flex min-h-[220px] flex-1">
              <textarea
                className={
                  theme === "dark"
                    ? "min-h-[220px] flex-1 resize-none rounded-lg border border-[#374151] bg-black px-4 py-3 pr-14 text-[20px] leading-8 text-white shadow-sm outline-none focus:border-[#2dd4bf] focus:ring-2 focus:ring-[#134e4a]"
                    : "min-h-[220px] flex-1 resize-none rounded-lg border border-[#d1d5db] bg-white px-4 py-3 pr-14 text-[20px] leading-8 text-black shadow-sm outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
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
                onKeyUp={(event) => {
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
                  aria-hidden="true"
                  className={
                    theme === "dark"
                      ? "autocomplete-overlay border-[#374151] bg-black text-white shadow-lg"
                      : "autocomplete-overlay border-[#d1d5db] bg-white text-black shadow-lg"
                  }
                  style={{
                    left: autocompletePosition.left,
                    top: autocompletePosition.top,
                  }}
                >
                  {autocompleteSuggestions.map((suggestion) => (
                    <span className="autocomplete-overlay__word" key={suggestion}>
                      <span
                        aria-hidden="true"
                        className="autocomplete-overlay__glyph sitelen-pona"
                      >
                        {suggestion}
                      </span>
                      <span>
                        <strong>
                          {suggestion.slice(0, cursorWord.word.length)}
                        </strong>
                        {suggestion.slice(cursorWord.word.length)}
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}
              <button
                aria-label={
                  theme === "dark" ? "o ante tawa suno" : "o ante tawa mun"
                }
                aria-pressed={theme === "dark"}
                className="theme-button absolute right-0 top-0 z-20 lg:fixed lg:right-5 lg:top-6"
                data-theme={theme}
                onClick={toggleTheme}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="sitelen-pona theme-button__glyph"
                >
                  {theme === "dark" ? "suno" : "mun"}
                </span>
              </button>
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
                  ? "flex min-h-6 items-center gap-2 text-[16px] leading-6 text-[#d1d5db]"
                  : "flex min-h-6 items-center gap-2 text-[16px] leading-6 text-[#374151]"
              }
            >
              {isTextFocused && definitionWord && cursorDefinition ? (
                <>
                  <span
                    aria-hidden="true"
                    className={
                      theme === "dark"
                        ? "sitelen-pona text-2xl leading-none text-[#5eead4]"
                        : "sitelen-pona text-2xl leading-none text-[#0f766e]"
                    }
                  >
                    {definitionWord}
                  </span>
                  <span
                    className={
                      theme === "dark"
                        ? "font-semibold text-[#5eead4]"
                        : "font-semibold text-[#0f766e]"
                      }
                  >
                    {definitionWord}
                  </span>
                  {cursorDefinition}
                </>
              ) : null}
            </p>
          </label>

          <div className="flex min-h-[360px] flex-1 flex-col gap-3">
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
              <label
                className={
                  theme === "dark"
                    ? "flex min-w-0 flex-1 items-center gap-3 text-sm font-medium text-[#d1d5db]"
                    : "flex min-w-0 flex-1 items-center gap-3 text-sm font-medium text-[#374151]"
                }
              >
                <span className="sitelen-pona shrink-0 text-2xl leading-none">
                  lili anu suli
                </span>
                <input
                  className={
                    theme === "dark"
                      ? "w-[200px] cursor-pointer accent-[#2dd4bf]"
                      : "w-[200px] cursor-pointer accent-[#0f766e]"
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
              <div className="flex shrink-0 items-end">
                <button
                  className="png-button inline-flex items-center gap-1"
                  data-theme={theme}
                  onClick={copyPng}
                  ref={pngButtonRef}
                  type="button"
                >
                  <span className="sitelen-pona text-2xl leading-none">
                    pana
                  </span>
                </button>
              </div>
            </div>
            <div
              ref={previewRef}
              className={
                theme === "dark"
                  ? "sitelen-pona relative min-h-[360px] flex-1 whitespace-pre-wrap rounded-lg border border-[#374151] bg-black px-4 py-3 text-white shadow-sm"
                  : "sitelen-pona relative min-h-[360px] flex-1 whitespace-pre-wrap rounded-lg border border-[#d1d5db] bg-white px-4 py-3 shadow-sm"
              }
              style={{
                fontSize,
                lineHeight: SITELEN_LINE_HEIGHT,
              }}
            >
              <a
                aria-label="vpavlenko/sitelen"
                className={
                  theme === "dark"
                    ? "mama-link sitelen-pona absolute bottom-3 right-3 z-20 text-2xl leading-none text-white lg:fixed lg:bottom-6 lg:right-5"
                    : "mama-link sitelen-pona absolute bottom-3 right-3 z-20 text-2xl leading-none text-black lg:fixed lg:bottom-6 lg:right-5"
                }
                data-theme={theme}
                href="https://github.com/vpavlenko/sitelen"
                rel="noreferrer"
                target="_blank"
              >
                mama
              </a>
              {copyState === "copied" || copyState === "downloaded" ? (
                <p
                  className={
                    theme === "dark"
                      ? "absolute right-0 top-0 z-10 flex items-center gap-1 whitespace-nowrap rounded-bl-md rounded-tr-lg border-b border-l border-[#4b5563] bg-black px-3 py-2 text-sm font-medium text-white shadow-lg"
                      : "absolute right-0 top-0 z-10 flex items-center gap-1 whitespace-nowrap rounded-bl-md rounded-tr-lg border-b border-l border-[#d1d5db] bg-white px-3 py-2 text-sm font-medium text-black shadow-lg"
                  }
                >
                  <span className="sitelen-pona text-xl leading-none text-[#0f766e]">
                    {copyState === "copied"
                      ? "sitelen li lon poki tu"
                      : "sitelen li kama"}
                  </span>
                </p>
              ) : null}
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
                ? "sitelen-pona png-capture-layer whitespace-pre-wrap rounded-lg border border-[#374151] bg-black px-4 py-3 text-white shadow-sm"
                : "sitelen-pona png-capture-layer whitespace-pre-wrap rounded-lg border border-[#d1d5db] bg-white px-4 py-3 text-black shadow-sm"
            }
            style={{
              ...captureAnimation.style,
              height: captureAnimation.height,
              width: captureAnimation.width,
            }}
          >
            {text || " "}
          </div>
        ) : null}

        {copyState === "error" ? (
          <p className="flex flex-wrap items-center gap-x-1 text-sm font-medium text-[#b91c1c]">
            <span className="sitelen-pona text-xl leading-none">
              pali sitelen li pakala. ken la ilo ni li wile e
            </span>
            <span>HTTPS</span>
            <span className="sitelen-pona text-xl leading-none">anu</span>
            <span>localhost</span>
            <span>.</span>
          </p>
        ) : null}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const DEFAULT_TEXT = `tenpo+sike 2001 la jan [_sona_olin_nasin_jan_awen] li lon e toki nanpa wan pi+toki+pona.
jan mute pi++ma ale li kepeken e ona.
jan+ale pi ma+tomo o jo+ala e ilo+tawa taso!`;

const SITELEN_FONT_SIZE_STORAGE_KEY = "sitelen-font-size";
const THEME_STORAGE_KEY = "sitelen-theme";
const TEXT_STORAGE_KEY = "sitelen-text";
const SITELEN_FONT_SIZE_DEFAULT = 40;
const SITELEN_FONT_SIZE_MIN = 1;
const SITELEN_FONT_SIZE_MAX = 100;
const SITELEN_LINE_HEIGHT = 1.16;
const PNG_EXPORT_SCALE_MULTIPLIER = 2;

type CopyState = "idle" | "copied" | "downloaded" | "error";
type Definitions = Record<string, string>;
type Theme = "dark" | "light";
type CursorWord = {
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
    end,
    glyphEnd,
    glyphStart,
    start,
    word: value.slice(start, end).toLowerCase(),
  };
}

function renderSitelenText(text: string, cursorWord: CursorWord) {
  if (cursorWord.glyphStart === cursorWord.glyphEnd) {
    return text || " ";
  }

  return (
    <>
      {text.slice(0, cursorWord.glyphStart)}
      <span className="bg-yellow-300 text-black">
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
  const [cursorWord, setCursorWord] = useState<CursorWord>({
    end: 0,
    glyphEnd: 0,
    glyphStart: 0,
    start: 0,
    word: "",
  });
  const [isTextFocused, setIsTextFocused] = useState(false);
  const pngButtonRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

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

  function updateCursorWord(element: HTMLTextAreaElement) {
    setCursorWord(getWordAtCursor(element.value, element.selectionStart));
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
    setCursorWord({ end: 0, glyphEnd: 0, glyphStart: 0, start: 0, word: "" });
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
      return;
    }

    const previewRect = preview.getBoundingClientRect();
    const buttonRect = pngButton.getBoundingClientRect();
    const targetScale = 0.12;
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
    window.setTimeout(() => {
      setCaptureAnimation(null);
    }, 1440);
  }

  async function copyPng() {
    const preview = previewRef.current;

    if (!preview) {
      return;
    }

    try {
      setCopyState("idle");
      animatePngCapture();

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
        await document.fonts.load(
          `${renderedFontSize * scale}px "Linja Pona"`,
        );
        await document.fonts.ready;
      }

      const measureCanvas = document.createElement("canvas");
      const measureContext = measureCanvas.getContext("2d");

      if (!measureContext) {
        throw new Error("Could not create canvas context.");
      }

      measureContext.font = `${renderedFontSize}px "Linja Pona", sans-serif`;
      const lines = wrapCanvasText(measureContext, text, maxTextWidth);
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

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Could not create PNG."));
          }
        }, "image/png");
      });

      if (navigator.clipboard && "ClipboardItem" in window) {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
        setCopyState("copied");
        return;
      }

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "sitelen-toki.png";
      link.click();
      URL.revokeObjectURL(link.href);
      setCopyState("downloaded");
    } catch (error) {
      console.error(error);
      setCopyState("error");
    }
  }

  return (
    <main
      className={
        theme === "dark"
          ? "min-h-screen bg-black text-white"
          : "min-h-screen bg-white text-black"
      }
    >
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-5 py-6 md:px-8">
        <header
          className={
            theme === "dark"
              ? "flex items-center justify-between gap-4  pb-4"
              : "flex items-center justify-between gap-4  pb-4"
          }
        >
          <h1 className="sitelen-pona mt-1 text-4xl font-semibold md:text-5xl">
            o toki kepeken sitelen+pona
          </h1>
          <button
            aria-label={
              theme === "dark" ? "o ante tawa suno" : "o ante tawa mun"
            }
            aria-pressed={theme === "dark"}
            className="theme-button"
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
        </header>

        <section className="flex flex-1 flex-col gap-5">
          <label className="flex min-h-[220px] flex-col gap-3">
            <div className="relative flex min-h-[220px] flex-1">
              <textarea
                className={
                  theme === "dark"
                    ? "min-h-[220px] flex-1 resize-none rounded-lg border border-[#374151] bg-black px-4 py-3 pr-14 text-[20px] leading-8 text-white shadow-sm outline-none focus:border-[#2dd4bf] focus:ring-2 focus:ring-[#134e4a]"
                    : "min-h-[220px] flex-1 resize-none rounded-lg border border-[#d1d5db] bg-white px-4 py-3 pr-14 text-[20px] leading-8 shadow-sm outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                }
                onChange={(event) => {
                  updateText(event.target.value);
                  updateCursorWord(event.currentTarget);
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
                onSelect={(event) => {
                  updateCursorWord(event.currentTarget);
                }}
                spellCheck={false}
                value={text}
              />
              <button
                aria-label="o weka e toki"
                className="icon-button absolute bottom-3 right-3"
                data-theme={theme}
                onClick={resetText}
                type="button"
              >
                <span aria-hidden="true" className="sitelen-pona text-2xl">
                  weka
                </span>
              </button>
            </div>
            {isTextFocused && cursorWord.word ? (
              <p
                className={
                  theme === "dark"
                    ? "flex min-h-6 items-center gap-2 text-[16px] leading-6 text-[#d1d5db]"
                    : "flex min-h-6 items-center gap-2 text-[16px] leading-6 text-[#374151]"
                }
              >
                <span
                  aria-hidden="true"
                  className="sitelen-pona text-2xl leading-none"
                >
                  {cursorWord.word}
                </span>
                <span
                  className={
                    theme === "dark"
                      ? "font-semibold text-[#5eead4]"
                      : "font-semibold text-[#0f766e]"
                  }
                >
                  {cursorWord.word}
                </span>
                {": "}
                {definitions[cursorWord.word] ?? "sona ala"}
              </p>
            ) : null}
          </label>

          <div className="flex min-h-[360px] flex-1 flex-col gap-3">
            <div className="flex min-h-11 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label
                className={
                  theme === "dark"
                    ? "flex items-center gap-3 text-sm font-medium text-[#d1d5db]"
                    : "flex items-center gap-3 text-sm font-medium text-[#374151]"
                }
              >
                <span className="sitelen-pona text-2xl leading-none">
                  nanpa sitelen
                </span>
                <input
                  className={
                    theme === "dark"
                      ? "w-44 cursor-pointer accent-[#2dd4bf]"
                      : "w-44 cursor-pointer accent-[#0f766e]"
                  }
                  max={SITELEN_FONT_SIZE_MAX}
                  min={SITELEN_FONT_SIZE_MIN}
                  onChange={(event) => {
                    updateFontSize(Number(event.target.value));
                  }}
                  type="range"
                  value={fontSize}
                />
                <span className="w-10 text-right tabular-nums">{fontSize}</span>
              </label>
              <div className="relative flex items-end">
                <button
                  className="png-button inline-flex items-center gap-1"
                  data-theme={theme}
                  onClick={copyPng}
                  ref={pngButtonRef}
                  type="button"
                >
                  <span className="sitelen-pona text-2xl leading-none">
                    o pana e sitelen
                  </span>
                </button>
                {copyState === "copied" || copyState === "downloaded" ? (
                  <p
                    className={
                      theme === "dark"
                        ? "absolute right-0 top-[calc(100%+0.5rem)] z-10 flex items-center gap-1 whitespace-nowrap rounded-md border border-[#4b5563] bg-black px-3 py-2 text-sm font-medium text-white shadow-lg"
                        : "absolute right-0 top-[calc(100%+0.5rem)] z-10 flex items-center gap-1 whitespace-nowrap rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-sm font-medium text-black shadow-lg"
                    }
                  >
                    <span className="sitelen-pona text-xl leading-none">
                      {copyState === "copied"
                        ? "sitelen li lon poki tu"
                        : "sitelen li kama"}
                    </span>
                  </p>
                ) : null}
              </div>
            </div>
            <div
              ref={previewRef}
              className={
                theme === "dark"
                  ? "sitelen-pona min-h-[360px] flex-1 whitespace-pre-wrap rounded-lg border border-[#374151] bg-black px-4 py-3 text-white shadow-sm"
                  : "sitelen-pona min-h-[360px] flex-1 whitespace-pre-wrap rounded-lg border border-[#d1d5db] bg-white px-4 py-3 shadow-sm"
              }
              style={{
                fontSize,
                lineHeight: SITELEN_LINE_HEIGHT,
              }}
            >
              {isTextFocused
                ? renderSitelenText(text, cursorWord)
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

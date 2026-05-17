"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const DEFAULT_TEXT = `tenpo+sike mute ale mute wan la jan [_sona_olin_nasin_jan_awen] li lon e toki+pona
jan [_sona] li jan+lawa pi+toki+pona
jan mute pi++ma ale li kepeken e ona`;

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

  const cursorDefinition = definitions[cursorWord.word];

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
              {isTextFocused && cursorWord.word && cursorDefinition ? (
                <>
                  <span
                    aria-hidden="true"
                    className={
                      theme === "dark"
                        ? "sitelen-pona text-2xl leading-none text-[#5eead4]"
                        : "sitelen-pona text-2xl leading-none text-[#0f766e]"
                    }
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
                  nanpa sitelen
                </span>
                <input
                  className={
                    theme === "dark"
                      ? "w-[100px] cursor-pointer accent-[#2dd4bf]"
                      : "w-[100px] cursor-pointer accent-[#0f766e]"
                  }
                  max={SITELEN_FONT_SIZE_MAX}
                  min={SITELEN_FONT_SIZE_MIN}
                  onChange={(event) => {
                    updateFontSize(Number(event.target.value));
                  }}
                  type="range"
                  value={fontSize}
                />
                <span className="min-w-[2ch] shrink-0 tabular-nums">
                  {fontSize}
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

const SPLIT = /(\[[FP][1-9]\d*\])/;

/** Shows reference marks in the accent color. Everything is a React text node. */
export function RefText({ text }: { text: string }) {
  return (
    <>
      {text.split(SPLIT).map((part, index) =>
        SPLIT.test(part) ? (
          <span key={index} className="ref">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

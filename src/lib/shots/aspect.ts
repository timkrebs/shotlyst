// Aspect ratios such as "16:9" or "2.39:1", and centre crops to them.

export function parseAspectRatio(ratio: string | null | undefined): number {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio ?? "");
  if (!match || Number(match[2]) === 0) return 16 / 9;
  return Number(match[1]) / Number(match[2]);
}

// The largest centred rectangle of the given ratio inside an image.
export function centreCrop(width: number, height: number, ratio: number) {
  const current = width / height;
  if (current > ratio) {
    const cropWidth = Math.round(height * ratio);
    return { x: Math.round((width - cropWidth) / 2), y: 0, width: cropWidth, height };
  }
  const cropHeight = Math.round(width / ratio);
  return { x: 0, y: Math.round((height - cropHeight) / 2), width, height: cropHeight };
}

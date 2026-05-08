/**
 * Applies transparency to the color formats used in this repo without regexes.
 * It parses hex and functional CSS colors with simple character scanning.
 */
export const transparentizeColor = (amount: number, color: string) => {
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
  const isWhitespace = (char: string) =>
    char === " " || char === "\n" || char === "\r" || char === "\t"
  const trimWhitespace = (value: string) => {
    let start = 0
    let end = value.length

    while (start < end && isWhitespace(value[start])) start += 1
    while (end > start && isWhitespace(value[end - 1])) end -= 1

    return value.slice(start, end)
  }
  const parseNumber = (value: string) => {
    const trimmed = trimWhitespace(value)
    if (!trimmed) return null

    const parsed = Number.parseFloat(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  const splitTopLevelArgs = (value: string) => {
    const args: string[] = []
    let start = 0
    let depth = 0

    for (let i = 0; i < value.length; i += 1) {
      const char = value[i]

      if (char === "(") {
        depth += 1
        continue
      }

      if (char === ")") {
        if (depth > 0) depth -= 1
        continue
      }

      if (char === "," && depth === 0) {
        args.push(trimWhitespace(value.slice(start, i)))
        start = i + 1
      }
    }

    args.push(trimWhitespace(value.slice(start)))
    return args
  }
  const parseFunctionalColor = (value: string) => {
    const trimmed = trimWhitespace(value)
    const openIndex = trimmed.indexOf("(")

    if (openIndex <= 0 || trimmed[trimmed.length - 1] !== ")") return null

    return {
      name: trimWhitespace(trimmed.slice(0, openIndex)).toLowerCase(),
      args: splitTopLevelArgs(trimmed.slice(openIndex + 1, -1)),
    }
  }
  const parseHexColor = (value: string) => {
    const trimmed = trimWhitespace(value)
    if (!trimmed.startsWith("#")) return null

    const hex = trimmed.slice(1)
    if (hex.length !== 3 && hex.length !== 6) return null

    for (const char of hex) {
      const lower = char.toLowerCase()
      const isDigit = lower >= "0" && lower <= "9"
      const isHexAlpha = lower >= "a" && lower <= "f"

      if (!isDigit && !isHexAlpha) return null
    }

    if (hex.length === 3) {
      const [r, g, b] = hex
      return {
        r: Number.parseInt(r + r, 16),
        g: Number.parseInt(g + g, 16),
        b: Number.parseInt(b + b, 16),
      }
    }

    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    }
  }
  const formatAlpha = (alpha: number) => `${clamp01(alpha)}`

  const hex = parseHexColor(color)

  if (hex) {
    return `rgba(${hex.r}, ${hex.g}, ${hex.b}, ${formatAlpha(1 - amount)})`
  }

  const parsed = parseFunctionalColor(color)
  if (!parsed) return color

  const { name, args } = parsed

  if (name === "hsl" || name === "rgb") {
    if (args.length !== 3) return color
    return `${name}a(${args[0]}, ${args[1]}, ${args[2]}, ${formatAlpha(
      1 - amount,
    )})`
  }

  if (name === "hsla" || name === "rgba") {
    if (args.length !== 4) return color

    const alpha = parseNumber(args[3])
    if (alpha === null) return color

    return `${name}(${args[0]}, ${args[1]}, ${args[2]}, ${formatAlpha(
      alpha - amount,
    )})`
  }

  return color
}

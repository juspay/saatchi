import type { Saatchi } from "saatchi"

export default async ({ page, shot }: Saatchi) => {
  await shot("home")
}

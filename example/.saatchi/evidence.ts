import type { Saatchi } from "saatchi"

export default async ({ page, shot }: Saatchi) => {
  await shot("list")

  await page.getByRole("link", { name: "beta" }).click()
  await page.getByRole("heading", { name: "beta" }).waitFor()
  await shot("item")

  await page.getByRole("link", { name: "back" }).click()
  await page.getByRole("heading", { name: "items" }).waitFor()
  await shot("back")
}

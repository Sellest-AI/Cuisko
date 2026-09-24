# Fonts

`Unbounded-Medium.ttf` is the H4 face, from Google Fonts. It is loaded in
`src/providers/fonts.tsx`; its name and metrics live in `src/global/fonts.ts`.

Every file here ships to every user, loaded or not, so nothing else belongs in this folder. The
test in `src/global/__tests__/fonts.test.ts` fails if another `.ttf` appears.

`Unbounded-OFL.txt` is the SIL Open Font Licence for it. It has to travel with the font: deleting
it while keeping the `.ttf` is a licence violation, not tidying.

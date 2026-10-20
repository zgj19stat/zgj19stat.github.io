# Chinese and English pages

English remains the default. Chinese pages live under `/cn/`. The language
control follows the matching page in `_data/languages.yml` and preserves the
paper anchor and the research map's Themes/Timeline view. No automatic
language redirect or separate visitor counter is used.

## Editing content

- Homepage research prose: `_pages/about.md` and `_pages/about-cn.md`.
- News, teaching and awards: paired `en` and `zh` fields in `_data/profile.yml`.
- Education: existing English fields and nested `zh` fields in
  `_data/academic_path.yml`. Dates, links and identities are shared.
- Talks and posters: `_data/talks.yml`. Keep historical talk titles, dates and
  events. The English list must not contain Chinese text.
- Papers and map geometry: `_data/publications.yml` is shared unchanged by
  both languages. Paper titles, author lists, statuses, theme labels and
  links remain English.
- Interface copy: `_data/i18n.yml` and localized includes.
- English CV: `files/CV.pdf`. Chinese CV: `files/CV_Chinese.pdf`. Editable
  LaTeX sources remain in the local CV project, not the public website.

The Chinese talk titles are translations of the historical English titles.
Where an official English conference name is unavailable, a descriptive
English translation is used. Review both language fields when an event
organizer supplies an official name.

## Validation

The build runs `scripts/validate-bilingual.py` along with the existing
homepage and map validators. It checks six paired pages, language metadata,
shared record IDs, identical publication entries and map geometry, and
both PDF downloads. The English PDF hash is intentionally pinned to the
approved baseline; update that check only when a new English CV is approved.

Browser checks should include desktop and 320–600 px mobile layouts, the
navigation menu, keyboard focus, paired-page switching with a paper hash,
Timeline switching, map interactions, and a JavaScript-disabled visit.

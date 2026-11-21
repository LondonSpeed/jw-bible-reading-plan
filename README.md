# JW Bible Reading Plan (Obsidian)

> Unofficial. Not affiliated with or endorsed by jw.org or any publisher. It only creates links that open verses in the JW Library app.

Creates a Bible reading schedule as an ordinary note in your vault. Every day has a checklist with links that open the chapter in **JW Library**.

## Features
- **Four reading modes:** cover to cover, chronological, thematic, life and ministry of Jesus
- **Equal daily portions:** the text is divided by its size, not by chapter count, so every day is about the same amount of reading. Very long chapters (for example Psalm 119) are split into verse ranges.
- **Pick the period:** a number of weeks, or an end date
- **Starting midway:** mark books or chapters you already read and the plan is spread over the rest
- **Three languages:** Estonian, English, Russian (book names, headings, short chapter notes). The language JW Library opens is a separate setting.
- **Progress:** tick the boxes in the note. The status bar shows your progress and today's reading.

## Commands
- Create Bible reading plan…
- Go to today's reading
- Insert today's reading here (an embed you can put in a daily note; ticking it updates the plan)
- Update progress line in this plan

## Develop
```
npm install
npm run dev
npm test
```
`PLAN_HTML=/path/to/plan.html npm test` also compares the planner with the original app code.

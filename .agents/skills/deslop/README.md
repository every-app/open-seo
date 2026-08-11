# deslop

A Claude skill for removing AI writing patterns from prose.

## What it does

When you write, draft, edit, or review text, `deslop` identifies and eliminates predictable AI tells: formulaic sentence structures, filler phrases, false agency, dramatic fragmentation, vague declaratives, and dozens of other patterns that signal machine-generated writing.

The skill works across any prose context. Examples are weighted toward scientific writing and technical blog posts, but the rules apply to any writing where you want a human voice without the AI veneer. For scientific contexts specifically, the skill accounts for conventions like passive voice in methods sections and domain-specific terminology.

## Installation

**Option 1: Download ZIP**

Click the green **Code** button at the top of this repo, then **Download ZIP**. Extract the ZIP and add the folder to your Claude skills directory.

**Option 2: Releases**

Go to the [Releases](https://github.com/stephenturner/skill-deslop/releases) page and download the latest `.skill` file. Add it to your Claude skills in [customize/skills](https://claude.ai/customize/skills) on the web, or double-click it if you have Claude Desktop installed.

**Option 3: Build it yourself**

Build a `.skill` file from the source code, then add it to your Claude skills as described above.

```sh
git clone https://github.com/stephenturner/skill-deslop.git
cd skill-deslop
zip -r deslop.skill SKILL.md references/
```

## How to use it

Install as described above, then use it like you normally talk to Claude. The skill triggers automatically when you:

- Ask Claude to write prose (blog posts, essays, articles, memos, newsletters) making it sound natural instead of AI-generated
- Ask Claude to "deslop", "de-AI" or "make it sound human"
- Ask Claude to check for "slop" or AI patterns

You can also reference the skill directly:

- "Review this draft using the deslop checklist"
- "Score this text on the deslop rubric"
- "Rewrite this paragraph to pass the deslop quick checks"

## Scoring rubric

The skill includes a 1-10 scoring rubric across five dimensions:

| Dimension | Question |
|-----------|----------|
| Directness | Statements or announcements? |
| Rhythm | Varied or metronomic? |
| Trust | Respects reader intelligence? |
| Authenticity | Sounds like a specific human wrote it? |
| Density | Anything cuttable? |

Below 35/50: revise.

## Skill structure

```
deslop/
├── SKILL.md              # Core rules, quick checks, scoring rubric
├── README.md             # This file
└── references/
    ├── phrases.md        # Phrases to remove or replace
    ├── structures.md     # Structural patterns to avoid
    ├── tropes.md         # Full catalog of AI writing tropes
    └── examples.md       # Before/after transformations
```

## Acknowledgments

This skill was built in part by combining and synthesizing material from two open sources:

- **AI writing tropes catalog** from [tropes.fyi](https://tropes.fyi/) by [Ossama Hassanein](https://ossama.is). The `references/tropes.md` file is adapted from this source, and trope patterns are integrated throughout the other reference files.
- **stop-slop** from [github.com/hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) by [Hardik Pandya](https://hvpandya.com). The phrase lists, structural patterns, before/after examples, scoring rubric, and quick checks draw from this project.

## License

MIT

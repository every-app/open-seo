# Contributing to OpenSEO

Thank you for your interest in contributing to OpenSEO!

We deeply appreciate the time and enthusiasm that people bring to the project. One of my favorite things is seeing the forks that people make building off of OpenSEO.

## Why aren't we accepting PRs?

Short Answer: AI & Security

I love using AI to write code as much as anyone. But, it makes it very challenging to assess how much thought and effort went into external pull requests. As a result, I spend a lot of time reviewing, testing and iterating on many external PRs and it ends up slowing down overall development.

Additionally, as OpenSEO becomes more popular, I'm concerned about malicious contributors attempting to sneak in code that slips through review.

## Issues: The best way to contribute

A succinct, clearly written issue describing the problem your facing and your desired behavior is worth its weight in gold.

This is much easier for me to review than a PR. If its something that I think a coding agent can easily build, I'll have my own agent build it right away. If it's something bigger, I'll add it to the roadmap.

### Can I still make PRs?

Yup! I just won't merge them right now. But, making a PR can be a good way to improve the quality of your issue. I'm much more likely to prioritize implementing something myself if you've already created a proof of concept for an integration or built a great UI for me to take inspiration from.

Videos demoing the feature also help a lot here too since its a sign that the PR wasn't just made by Claude and never tested.

### /simple-issue-description

For ease of review, I would appreciate if you used the `/simple-issue-description` to refine your issue. I'm hoping that everything being written in the same voice and format will make it easier to understand issues without a lot of back and forth.

Install it with:

```sh
npx skills add every-app/open-seo --skill simple-issue-description
```

See [Set up OpenSEO Agent Skills](https://openseo.so/docs/skills/setup) for other install options.

Here is what we're aiming for with `/simple-issue-description`:

- There is sufficient detail in the issue.
  - What is the problem you're facing?
  - What is the full user experience for the feature you're proposing?
- Succinct i.e. not default Claude output.
  - I have an `/explain-simply` skill I use all the time which inspired `/simple-issue-description`
  - I can't understand the default Claude / Codex output at this point.

### Our Roadmap

Here is a link to our Roadmap: http://openseo.so/roadmap

These are planned features and improvements. If you'd like to create an issue and give your thoughts on what would make these features great, I'm all ears!

## Wrapping Up

I know that this may be disappointing for some people. I hope that in 6 months, we have some awesome review process that alleviates my concerns leading to current process.

If you would like to be more involved though, the best way is to [Join our Discord](https://discord.com/invite/c9uGs3cFXr) :

- Help others when they ask questions
- Share your experiences doing SEO
- Share things you learned while building your fork

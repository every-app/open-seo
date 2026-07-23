# Before/After Examples

## Example 1: Throat-Clearing + Binary Contrast (Scientific)

**Before:**
> "Here's the thing: forecasting infectious disease is hard. Not because the models are complex. Because the data is complex. Let that sink in."

**After:**
> "Forecasting infectious disease is hard. The models are tractable. The data, collected under shifting surveillance definitions and reporting lags, is not."

**Changes:** Removed opener, binary contrast structure, and emphasis crutch. Named the specific problem with the data.

---

## Example 2: Filler + "Despite These Challenges" (Cover Letter)

**Before:**
> "It's worth noting that these findings have important implications for how we navigate the challenges of forecast ensembling moving forward. Despite these challenges, this work contributes meaningfully to the growing body of literature, highlighting the need for continued evaluation and underscoring the importance of robust benchmarking."

**After:**
> "If individual model rankings are unstable across geography and time, ensemble methods that weight models by past performance may not improve on equal-weight approaches."

**Changes:** Replaced filler transition, vague declarative, "despite these challenges" formula, and two superficial participle phrases with the specific implication of the findings.

---

## Example 3: Grandiose Stakes + Landscape (Scientific)

**Before:**
> "In today's rapidly evolving genomic landscape, single-cell RNA sequencing has fundamentally reshaped how we think about cellular heterogeneity. This paradigm shift has far-reaching implications for our understanding of disease."

**After:**
> "Single-cell RNA sequencing reveals cell-type-specific expression patterns that bulk methods average out. In tumor samples, this distinction matters: rare resistant subpopulations visible in single-cell data disappear in bulk profiles."

**Changes:** Eliminated "landscape," "paradigm shift," "fundamentally," and the vague stakes claim. Replaced with a concrete example of why the method matters.

---

## Example 4: Passive Voice + False Agency (Discussion Section)

**Before:**
> "It was observed that model performance degraded at longer forecast horizons. The uncertainty naturally increased as the prediction window expanded. These results emerged from our analysis of 54 state-level forecasts."

**After:**
> "We observed that model performance degraded at longer forecast horizons. Each additional week of lead time added roughly 15% to the mean WIS. We saw this pattern across all 54 state-level forecasts."

**Changes:** Named the actor ("we"). Replaced false agency ("uncertainty naturally increased," "results emerged") with specific claims and a number.

---

## Example 5: Self-Posed Rhetorical Question (Blog Post)

**Before:**
> "What if I told you that most bioinformatics pipelines break in production? The result? Wasted compute and silent errors. The worst part? Nobody checks the intermediate outputs. Here's why that matters:"

**After:**
> "Most bioinformatics pipelines break in production, and the failures are quiet. The FASTQ passes QC. The alignment runs. But the reference genome version changed between runs, and the variant calls shift without warning."

**Changes:** Removed rhetorical setup and three self-posed questions. Replaced with a specific failure scenario the reader can picture.

---

## Example 6: "Serves As" + Superficial Participle Analysis (Abstract)

**Before:**
> "The FluSight initiative serves as a foundational framework for influenza forecasting in the United States, contributing to public health preparedness and underscoring the importance of collaborative forecasting efforts."

**After:**
> "The FluSight initiative coordinates influenza forecasting across dozens of modeling groups in the United States. Since 2013, it has standardized targets, submission formats, and evaluation metrics."

**Changes:** Replaced "serves as a foundational framework" with what FluSight does. Replaced two participle phrases with a specific fact.

---

## Example 7: Narrator Distance + Vague Declarative (Blog Post)

**Before:**
> "Nobody designed the current state of genomic data sharing. The reasons are structural. This is genuinely hard, and the implications are significant."

**After:**
> "You inherit a genomic data sharing system that grew by accretion: dbGaP for controlled access, GEO for expression, SRA for raw reads, ClinVar for variants. Each solves one problem. None talks to the others without custom glue code."

**Changes:** Replaced narrator distance ("Nobody designed...") with "you." Replaced two vague declaratives with the specific structural problem.

---

## Example 8: Listicle in a Trench Coat (Discussion Section)

**Before:**
> "The first limitation of our study is the relatively short evaluation window. The second limitation is the lack of a standardized baseline across all forecasters. The third limitation is the potential for overfitting to the specific characteristics of the 2021-22 and 2022-23 seasons."

**After:**
> "Our evaluation covers only two seasons, and both followed the unusual post-COVID influenza dynamics that may not generalize. We also lacked a standardized baseline: each forecaster chose their own training data and feature set, making apples-to-apples comparison difficult."

**Changes:** Replaced the numbered listicle structure with woven prose. Combined related points and added specificity about why the limitations matter.

---

## Example 9: One-Point Dilution (Blog Post)

**Before:**
> "Reproducibility matters. In fact, reproducibility is the most underrated quality in computational biology. When you make your analysis reproducible, you reduce errors. Fewer errors mean more trust. More trust means faster adoption. The lesson? Make it reproducible. Irreproducible analyses are the enemy of science. The best papers are the reproducible ones."

**After:**
> "Reproducible analyses catch errors earlier. When Beaulieu-Jones and Greene re-ran 68 papers from the PharmacoGenomics Knowledge Base, only 40% reproduced. The ones that failed had no shared code or pinned dependency versions."

**Changes:** Eight sentences restating one point became three sentences with a specific supporting example and a number.

---

## Example 10: Historical Analogy Stacking (General)

**Before:**
> "Apple didn't build Uber. Facebook didn't build Spotify. Stripe didn't build Shopify. AWS didn't build Airbnb. Every major technological shift follows the same pattern."

**After:**
> "AWS sold infrastructure. Airbnb built a business on top of it. That split between platform and product repeats across the industry."

**Changes:** One concrete example examined in depth instead of four name-drops. Named the specific pattern.

---

## Example 11: Anaphora Abuse (Grant Narrative)

**Before:**
> "We will develop novel computational methods. We will apply these methods to large-scale genomic datasets. We will validate our findings using independent cohorts. We will disseminate our tools through open-source repositories. We will train the next generation of computational biologists."

**After:**
> "We will develop and validate statistical methods for multi-ancestry fine-mapping using UK Biobank and TOPMed cohorts, then release them as an R package with documentation and tutorials suitable for graduate training."

**Changes:** Collapsed five anaphoric sentences into one that names specific methods, datasets, and deliverables.

---

## Example 12: Dramatic Fragmentation (General)

**Before:**
> "Speed. Quality. Cost. You can only pick two. That's it. That's the tradeoff."

**After:**
> "Speed, quality, cost: pick two."

**Changes:** Single sentence. No performative emphasis.

---

## Example 13: False Vulnerability + Meta-Commentary (Blog Post)

**Before:**
> "And yes, since we're being honest: I've run plenty of analyses where the p-value was borderline and I squinted at it until it cooperated. I want to explore why that impulse is so common. In this post, I'll walk you through what I've learned."

**After:**
> "I've nudged a borderline p-value along by trying one more covariate. You probably have too. The question is what makes that feel acceptable in the moment, and the answer is usually that the rest of the analysis already 'looks right.'"

**Changes:** Replaced false vulnerability with a specific, honest admission. Cut the meta-commentary ("In this post, I'll walk you through"). Stated the point instead of announcing it.

---

## Example 14: "It's Worth Noting" + Invented Concept Label (Scientific)

**Before:**
> "It's worth noting that this creates what might be called the 'calibration paradox': models that are well-calibrated at the national level may be poorly calibrated at the state level, reflecting broader trends in the tension between aggregation and granularity."

**After:**
> "National-level calibration does not guarantee state-level calibration. A model can produce well-calibrated 90% intervals for the US overall while consistently undercovering in states with smaller populations and noisier surveillance data."

**Changes:** Cut the filler transition and the invented concept label. Replaced the superficial participle analysis with the specific mechanism (small states, noisy data).

---

## Example 15: "Imagine a World" + Patronizing Analogy (General)

**Before:**
> "Imagine a world where every meeting had a clear agenda. Think of it like a recipe: you wouldn't start cooking without knowing the ingredients. That's the promise of async-first communication. Let's unpack why this matters."

**After:**
> "Meetings without agendas waste time. A 15-person sync with no written agenda averages 47 minutes and produces no decisions (Atlassian, 2019). Writing the agenda forces the organizer to decide whether the meeting is necessary at all."

**Changes:** Removed the "imagine" opener, the cooking analogy (which adds nothing), and the pedagogical "let's unpack." Replaced with a specific claim, a number, and the mechanism that makes agendas work.

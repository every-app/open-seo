// Subset of the product-intelligence report styleguide: tokens, typography,
// stat grid, bar chart, badges, cards, and tables. No scripts.
export const REPORT_CSS = `
@font-face{font-family:'iA Writer Quattro';font-style:normal;font-display:swap;font-weight:400;src:url(https://cdn.jsdelivr.net/fontsource/fonts/ia-writer-quattro@latest/latin-400-normal.woff2) format('woff2')}
@font-face{font-family:'iA Writer Quattro';font-style:normal;font-display:swap;font-weight:700;src:url(https://cdn.jsdelivr.net/fontsource/fonts/ia-writer-quattro@latest/latin-700-normal.woff2) format('woff2')}
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{font-size:24px;padding:1.5rem 2rem;color-scheme:light}
body{font-family:'iA Writer Quattro',Georgia,'Times New Roman',serif;font-size:1rem;line-height:1.6;color:#222;background:#f5f3f1;max-width:46em;margin:3rem auto}
h1,h2,h3,h4,h5{font-family:'Inter',system-ui,-apple-system,sans-serif}
h1{font-size:2.75rem;font-weight:700;line-height:1.05;margin:0 0 .75rem;letter-spacing:-.02em}
h2{font-size:1.35rem;font-weight:700;line-height:1.3;margin:4rem 0 1.25rem;letter-spacing:-.015em}
h3{font-size:1.15rem;font-weight:600;line-height:1.3;margin:3.5rem 0 .3rem}
h4{font-size:1rem;font-weight:600;line-height:1.4;margin:2.5rem 0 .25rem}
h5{font-size:.9rem;font-weight:600;line-height:1.4;margin:2rem 0 .2rem;text-transform:uppercase;letter-spacing:.03em}
p{margin:0 0 1rem}
strong{font-weight:700}
mark{background:#fff3b0;padding:.05em .2em;border-radius:2px}
small,.small{font-size:.8rem;color:#666}
.intro{font-size:1.2rem;color:#555;margin-bottom:3rem;line-height:1.5}
a{color:#222;text-decoration:underline;text-underline-offset:.15em;text-decoration-thickness:1px}
a:hover{color:#555}
ul,ol{margin:0 0 1rem;padding-left:1.5em}
li{margin:.35em 0}
code{font-family:'iA Writer Quattro','SF Mono','Fira Code',monospace;font-size:.85em;background:#e8e6e3;padding:.1em .35em;border-radius:3px;overflow-wrap:anywhere}
.pullquote{margin:2.5rem auto;padding:1.5rem 2rem;text-align:center;font-family:'Inter',system-ui,sans-serif;font-size:1.5rem;font-weight:500;line-height:1.35;color:#333;border-top:2px solid #222;border-bottom:2px solid #222;max-width:32em}
.table-wrap{overflow-x:auto;margin:0 0 1rem;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:.9rem;line-height:1.5;margin:0 0 1rem}
th,td{text-align:left;padding:.6em .8em;vertical-align:top}
th{font-family:'Inter',system-ui,sans-serif;font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:#555;border-bottom:2px solid #222}
td{border-bottom:1px solid #ddd}
table.striped tbody tr:nth-child(even){background:rgba(0,0,0,.03)}
table.compact th,table.compact td{padding:.3em .6em;font-size:.82rem}
.card{background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);margin:0 0 1rem}
.card-body{padding:1.25rem 1.5rem}
.card-body h4{margin-top:0;margin-bottom:.4rem}
.card-body p{font-size:.9rem;color:#555;margin-bottom:0}
.card-row{display:flex;gap:1.5rem;margin:1.5rem 0}
.card-row .card{flex:1;margin:0}
aside{margin:1.5rem 0;padding:1rem 1.25rem;font-size:.9rem;color:#555;background:rgba(0,0,0,.02);border-radius:6px}
hr{border:none;border-top:1px solid #ddd;margin:3rem 0}
hr.decorative{border:none;text-align:center;margin:3rem 0}
hr.decorative::after{content:"* * *";color:#999;font-size:.85rem;letter-spacing:.5em}
details{margin:0 0 1rem;border:1px solid #ddd;border-radius:6px;overflow:hidden}
summary{font-family:'Inter',system-ui,sans-serif;font-weight:600;font-size:.9rem;padding:.75rem 1rem;cursor:pointer;background:rgba(0,0,0,.02);list-style:none}
summary::-webkit-details-marker{display:none}
summary::before{content:"\\25B6\\FE0E";display:inline-block;margin-right:.5em;font-size:.7em;transition:transform .2s}
details[open] summary::before{transform:rotate(90deg)}
details>ul{padding:.75rem 1rem .75rem 2.25rem;margin:0}
.badge{display:inline-block;font-family:'Inter',system-ui,sans-serif;font-size:.65rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;padding:.25em .65em;border-radius:3px;background:#222;color:#f5f3f1;vertical-align:middle}
.badge.muted{background:#e8e6e3;color:#555}
.badge.critical{background:#c0392b;color:#fff}
.badge.important{background:#c9922a;color:#fff}
.badge.info{background:#2980b9;color:#fff}
.tag{display:inline-block;font-family:'Inter',system-ui,sans-serif;font-size:.7rem;font-weight:500;padding:.2em .6em;border-radius:12px;background:#e8e6e3;color:#444;text-decoration:none;margin:.15em}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:1rem;margin:1.5rem 0}
.stat-grid[data-cols="1"]{grid-template-columns:1fr;max-width:320px}
.stat-grid[data-cols="2"]{grid-template-columns:repeat(2,1fr)}
.stat-grid[data-cols="3"]{grid-template-columns:repeat(3,1fr)}
.stat-grid[data-cols="4"]{grid-template-columns:repeat(4,1fr)}
.stat-card{background:#fff;padding:1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);text-align:center;container-type:inline-size}
.stat-card .stat-value{font-family:'Inter',system-ui,sans-serif;font-size:2rem;font-size:clamp(1.2rem,12cqi,2rem);font-weight:700;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stat-card .stat-label{font-size:.72rem;color:#777;margin-top:.3rem;font-family:'Inter',system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em;overflow-wrap:break-word}
.stat-card .stat-meta{font-size:.62rem;color:#888;margin-top:.25rem;line-height:1.35;overflow-wrap:break-word}
.stat-card.red .stat-value{color:#c0392b}
.stat-card.green .stat-value{color:#2a8c4a}
.stat-card.amber .stat-value{color:#c9922a}
.stat-card .stat-value.na{color:#b3aea8;font-weight:400}
.bar-chart{margin:1.5rem 0;padding:1.5rem;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.bar-chart h5{margin:0 0 1rem;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:#999}
.bar-row{display:flex;align-items:center;margin:.5rem 0;gap:.75rem}
.bar-label{font-family:'Inter',system-ui,sans-serif;font-size:.75rem;font-weight:600;color:#444;width:155px;flex-shrink:0;text-align:right}
.bar-track{flex:1;height:31px;background:#f0eeec;overflow:hidden;position:relative}
.bar-fill{height:100%;display:flex;align-items:center;padding-left:.5rem}
.bar-fill.green{background:linear-gradient(90deg,#2a8c4a,#34a853)}
.bar-fill.amber{background:linear-gradient(90deg,#c9922a,#e0a832)}
.bar-fill.red{background:linear-gradient(90deg,#c0392b,#e74c3c)}
.bar-count{font-family:'Inter',system-ui,sans-serif;font-size:.7rem;font-weight:700;color:#fff;white-space:nowrap}
.dist-chart{margin:1.5rem 0}
.finding-ref{margin:.4rem 0}
.action-item{margin:0 0 2rem;padding:0 0 .5rem;border-bottom:1px solid #eee}
.action-item>p:first-child{margin-bottom:.25rem}
.action-item .small{margin-bottom:.6rem}
@media (max-width:900px){html{font-size:22px}}
@media (max-width:600px){
html{font-size:20px;padding:1rem}
body{margin:1.5rem auto}
h1{font-size:2rem}
h2{font-size:1.2rem;margin:3rem 0 1rem}
h3{font-size:1.05rem;margin:2.5rem 0 .25rem}
.card-row{flex-direction:column}
.pullquote{font-size:1.2rem;padding:1rem 1.25rem}
.stat-grid,.stat-grid[data-cols]{grid-template-columns:repeat(2,1fr)}
.bar-label{width:110px;font-size:.68rem}
}
@media print{html{font-size:14px;padding:0}body{margin:0 auto;background:#fff}details{border:none}}
`;

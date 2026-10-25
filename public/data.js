// All guide content lives here so it can be edited without touching rendering code.
const DATA = {
  stats: [["40", "agents"], ["16", "metrics"], ["24", "guardrails"], ["1", "real run"]],

  stack: [
    ["You", "Set goals and budget, approve every change that matters", "Strategy, approvals"],
    ["Guardrails", "Hard limits agents can never cross", "Spend caps, brand rules"],
    ["Workflows", "Agents chained in a fixed order, on a schedule", "Weekly report, daily audit"],
    ["Agents", "Workers with one job, one data source, one output", "Ad auditor, keyword miner"],
    ["Data", "Live connections to platforms — the foundation", "Google Ads, Meta, GSC, GA4"],
  ],

  ladder: [
    ["Manual", "You do everything by hand in the platforms.", "Write one prompt that turns an export into a report."],
    ["Assisted", "You paste data into a chatbot and copy answers back.", "Connect one live data source so you stop exporting."],
    ["Connected", "AI reads your accounts live but only when you ask.", "Put your first agent on a weekly schedule."],
    ["Scheduled", "Agents run on a calendar and report to you.", "Let agents draft changes you approve in one click."],
    ["Supervised autonomy", "Agents act within guardrails; you review the log.", "Add the next agent team and tighten your guardrails."],
  ],

  anatomy: [
    ["Role", "The job, in one sentence", "You are a Search Term Miner."],
    ["Data", "Exactly which sources it reads", "Search terms report, last 30 days."],
    ["Rules", "Steps and limits it must follow", "Flag terms with spend > $20 and 0 conversions."],
    ["Output", "The format it delivers", "Negative keyword list + reason per term."],
    ["Cadence", "When it runs", "Every Monday 8am."],
    ["Approval", "Who signs off", "You approve before anything is applied."],
  ],

  modes: {
    head: ["", "Prompt", "Automation", "Agent"],
    rows: [
      ["How it works", "You ask, it answers once", "Fixed steps run on a trigger", "Decides its own steps toward a goal"],
      ["Example", "Write 5 headlines", "Pause ad if CPA > 2x target", "Find wasted spend and propose fixes weekly"],
      ["Best for", "Drafts and brainstorms", "Simple, repeatable rules", "Judgment calls across data"],
    ],
  },
  rules: [
    "One agent, one job", "Live data only", "Same output every run", "Read-only first",
    "Humans approve money", "Log every change", "A schedule and an owner", "Measure before & after",
    "Kill unused agents", "Improve the rule weekly",
  ],

  plan30: [
    ["Day 1", "Pick one bottleneck", "The task that eats the most hours each week."],
    ["Day 2", "Write the role", "One sentence, one data source, one output."],
    ["Day 3", "Connect live data", "Read-only access to the platform it needs."],
    ["Days 4–6", "Run it read-only", "Compare its output to what you would have done."],
    ["Day 7", "Open the approval queue", "Agent proposes, you approve or reject."],
    ["Week 2", "Log and measure", "Track hours saved and results per approved change."],
    ["Week 3", "Improve the rules", "Turn each rejection into a new rule."],
    ["Week 4", "Add the next agent", "Repeat for the next bottleneck."],
  ],

  channels: {
    head: ["", "Google Ads", "Meta Ads", "SEO", "AI search"],
    rows: [
      ["What agents do", "Search terms, bids, budgets, RSAs", "Creative fatigue, audiences, budgets", "Pages losing clicks, titles, links", "Track & win AI answer citations"],
      ["What they read", "Search terms, impression share, conversions", "Frequency, CTR, CPA, ROAS by ad", "Search Console clicks & queries", "Citations in ChatGPT, Perplexity, Gemini"],
      ["How often", "Daily pacing, weekly search terms", "Twice a week", "Weekly", "Weekly"],
      ["First agent to set up", "Ads auditor", "Creative fatigue agent", "Click-loss detective", "Citation tracker"],
      ["Most common mistake", "Daily bid tweaks on smart bidding", "Judging creative after 2 days", "Publishing without internal links", "Changing the prompt set each week"],
      ["North star metric", "CPA and ROAS", "ROAS and CPA", "Organic clicks", "AI citations"],
    ],
  },

  teams: {
    google: { title: "The Google Ads agent team", tip: "Start with the auditor, search-term miner and budget guard.", agents: [
      ["Ads auditor", "Weekly health check across all campaigns", "Weekly"],
      ["Search term miner", "Finds wasted spend, proposes negatives", "Weekly"],
      ["Budget guard", "Flags pacing and over/under spend", "Daily"],
      ["RSA writer", "Drafts headlines from top performers", "Monthly"],
      ["Impression share tracker", "Lost IS by budget vs rank", "Weekly"],
      ["Quality score agent", "Low-QS keywords and fixes", "Monthly"],
      ["Bid strategy reviewer", "Target CPA/ROAS vs reality", "Bi-weekly"],
      ["PMax asset auditor", "Low-rated assets to replace", "Monthly"],
      ["Shopping feed checker", "Disapprovals and title fixes", "Weekly"],
      ["Landing page QA", "Broken pages and slow load", "Weekly"],
    ]},
    meta: { title: "The Meta Ads agent team", tip: "Start with creative fatigue, ad copy writer and audience overlap.", agents: [
      ["Creative fatigue agent", "Frequency up + CTR down = refresh", "2x week"],
      ["Winning creative breakdown", "Why top ads win: hook, format, offer", "Weekly"],
      ["Ad copy writer", "Variants from winning angles", "Weekly"],
      ["Hook analyser", "Thumb-stop and hold rates", "Weekly"],
      ["Audience overlap agent", "Ad sets competing with each other", "Monthly"],
      ["Attribution auditor", "Platform vs analytics conversions", "Monthly"],
      ["Budget shifter", "Proposes moves to best ad sets", "2x week"],
      ["Pixel health agent", "Event match quality and errors", "Weekly"],
      ["Placement analyser", "Which placements waste spend", "Monthly"],
      ["Competitor ad spy", "New ads in the Ad Library", "Weekly"],
    ]},
    seo: { title: "The SEO agent team", tip: "Start with the click-loss detective, title & meta rewriter and content gap finder.", agents: [
      ["Click-loss detective", "Pages losing clicks week over week", "Weekly"],
      ["Title and meta rewriter", "High impressions, low CTR pages", "Weekly"],
      ["Content gap finder", "Queries you rank 8–20 for", "Monthly"],
      ["Internal link agent", "Links from strong to weak pages", "Monthly"],
      ["Content refresher", "Decaying posts to update", "Monthly"],
      ["Technical crawler", "Broken links, redirects, 404s", "Weekly"],
      ["Schema agent", "Missing structured data", "Monthly"],
      ["Cannibalization checker", "Pages competing for one query", "Monthly"],
      ["Backlink monitor", "New and lost links", "Weekly"],
      ["SEO reporter", "One-page weekly summary", "Weekly"],
    ]},
    geo: { title: "The AI search (GEO) agent team", tip: "Start with the citation tracker, share-of-voice agent and answer gap finder.", agents: [
      ["Citation tracker", "Where AI answers cite you", "Weekly"],
      ["Share-of-voice agent", "You vs competitors in AI answers", "Weekly"],
      ["Answer gap finder", "Prompts where you're missing", "Monthly"],
      ["Quick-answer writer", "Direct answers for top prompts", "On demand"],
      ["FAQ builder", "FAQ blocks from real questions", "Monthly"],
      ["Comparison page agent", "X vs Y pages AI loves to cite", "Monthly"],
      ["Third-party mention finder", "Lists and reviews to get into", "Monthly"],
      ["Entity consistency agent", "Same facts everywhere about you", "Quarterly"],
      ["Crawl access checker", "AI bots allowed in robots.txt", "Monthly"],
      ["AI referral tracker", "Visits and sales from AI tools", "Weekly"],
    ]},
  },

  realRun: {
    kpis: [["Top 10", "pages losing clicks"], ["1,783", "clicks lost"], ["5 / 3 / 2", "rewrite / refresh / link"], ["+74%", "recovered in 4 weeks"]],
    rows: [
      ["/blog/google-ads-negative-keywords", 312, "Title drift — lost featured snippet", "Rewrite title"],
      ["/guides/meta-ads-budget", 268, "Outdated 2024 screenshots", "Refresh"],
      ["/blog/seo-reporting-template", 241, "Competitor published newer guide", "Refresh"],
      ["/tools/roas-calculator", 198, "No internal links from new posts", "Add links"],
      ["/blog/pmax-best-practices", 176, "CTR fell 3.1% → 1.9%", "Rewrite title"],
      ["/blog/ai-search-optimization", 164, "Cannibalised by new post", "Merge"],
      ["/guides/ga4-setup", 139, "Meta description truncated", "Rewrite title"],
      ["/blog/creative-fatigue", 117, "Missing FAQ schema", "Rewrite title"],
      ["/blog/cpa-vs-roas", 98, "Thin intro, high bounce", "Rewrite title"],
      ["/pricing", 70, "Orphaned after nav change", "Add links"],
    ],
  },

  metrics: [
    ["Cost", "CPA", "Cost per acquisition", "All paid"],
    ["Cost", "ROAS", "Revenue / ad spend", "All paid"],
    ["Cost", "Pacing", "Spend vs budget to date", "All paid"],
    ["Cost", "Wasted spend", "Spend on zero-conversion terms", "Google Ads"],
    ["Google Ads", "Search IS", "Impression share captured", "Google Ads"],
    ["Google Ads", "IS lost (budget)", "Missed due to budget", "Google Ads"],
    ["Google Ads", "Quality score", "Keyword relevance", "Google Ads"],
    ["Meta Ads", "Frequency", "Avg views per person", "Meta"],
    ["Meta Ads", "Hook rate", "3-sec views / impressions", "Meta"],
    ["Meta Ads", "CTR", "Clicks / impressions", "Meta"],
    ["SEO", "Organic clicks", "Clicks from Search Console", "SEO"],
    ["SEO", "Avg position", "Rank across queries", "SEO"],
    ["SEO", "Indexed pages", "Pages Google keeps", "SEO"],
    ["AI search", "AI citations", "Times AI answers cite you", "GEO"],
    ["AI search", "Share of voice", "Your citations vs competitors", "GEO"],
    ["AI search", "AI referrals", "Visits from AI tools", "GEO"],
  ],

  delegation: {
    Automate: ["Pull spend, ROAS, CPA and search terms", "Scan Search Console for drops", "Draft the Monday report", "Flag spend spikes and tracking breaks", "Track AI citations", "Crawl for broken links"],
    Approve: ["Pause campaigns or ad sets", "Add negative keywords", "Move budget between campaigns", "Launch new ad variants", "Publish rewritten titles", "Add internal links"],
    Drop: ["Reports nobody reads", "Daily bid tweaks on smart bidding", "Vanity dashboards", "Keyword stuffing", "Chasing algorithm rumours", "Manual weekly exports"],
    Keep: ["Positioning and offers", "Total monthly budget", "New channels and big bets", "Brand voice and creative direction", "Pricing", "Agency and hiring decisions"],
  },

  calendar: [
    ["Mon", [["Account audit", "Ads auditor"], ["Monday report", "SEO reporter"]]],
    ["Tue", [["Search & trend scan", "Search term miner"], ["AI answer check", "Citation tracker"]]],
    ["Wed", [["Search-term clean-up", "Approve negatives"], ["Title rewrites", "Title & meta rewriter"]]],
    ["Thu", [["Creative refresh", "Creative fatigue agent"], ["New copy review", "Ad copy writer"]]],
    ["Fri", [["Budget check", "Budget guard"], ["Week log", "Review every change"]]],
  ],

  guardrails: {
    Money: ["Cap daily budget changes at 20%", "Approval for any new campaign", "Hard monthly spend ceiling", "No bid changes during learning", "Alert when spend hits 2x daily average", "One kill switch that pauses agent changes"],
    Access: ["Read-only for the first two weeks", "OAuth you can revoke any time", "Separate access per client account", "No shared passwords, ever", "Least access each agent needs", "Review connected apps every quarter"],
    Content: ["Brand rules inside every writing role", "Human check on claims and prices", "No auto-publish on money pages", "AI policy check before launch", "A banned words and phrases list", "A source for every stat an agent writes"],
    Records: ["Log every applied change", "Who approved it, and when", "Before and after numbers", "A rollback for each change", "Weekly summary of all changes", "Keep logs for 12 months"],
  },

  cmo: {
    Data: ["Google Ads connected", "Meta Ads connected", "Search Console connected", "GA4 connected", "Conversion tracking verified"],
    "Ads agents": ["Auditor runs weekly", "Search term miner on", "Budget guard daily", "Creative fatigue agent on", "Approval queue in use"],
    "SEO agents": ["Click-loss detective weekly", "Titles rewritten monthly", "Content gaps reviewed", "Technical crawl weekly", "Internal links added"],
    "AI search": ["Prompt set defined", "Citations tracked weekly", "Share of voice vs 3 rivals", "AI bots allowed in robots.txt", "AI referrals in GA4"],
    Approvals: ["Every money change approved", "Log reviewed weekly", "Kill switch tested", "Rollbacks documented"],
    Team: ["Each agent has an owner", "Hours saved tracked", "Monthly agent review", "Unused agents removed", "Team trained on approvals"],
  },
};

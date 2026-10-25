// Hindi / English switch. Translates visible text and placeholders by exact English match,
// including content the app renders later (via MutationObserver). Choice is remembered per browser.
(() => {
  const HI = {
    // nav, auth, common
    "Guide": "गाइड", "Log out": "लॉग आउट", "Log in": "लॉग इन", "Create account": "अकाउंट बनाएँ", "Sign in": "साइन इन",
    "not signed in": "साइन इन नहीं", "Your agents, runs and checklists are saved to your account.": "आपके एजेंट, रन और चेकलिस्ट आपके अकाउंट में सेव रहते हैं।",
    "Agent dashboard": "एजेंट डैशबोर्ड", "Create agents, feed them data, review what they propose, approve or reject.": "एजेंट बनाएँ, उन्हें डेटा दें, उनके सुझाव देखें, और मंज़ूर या रिजेक्ट करें।",
    "Dashboard": "डैशबोर्ड", "Approve": "मंज़ूर करें", "Reject": "रिजेक्ट करें", "Open": "खोलें", "View": "देखें", "Send": "भेजें", "Track": "ट्रैक करें",
    "Export CSV": "CSV डाउनलोड", "Run now": "अभी चलाएँ", "Running…": "चल रहा है…", "approved": "मंज़ूर", "rejected": "रिजेक्ट", "pending": "बाकी",
    "Daily": "रोज़", "Weekly": "हर हफ़्ते", "Monthly": "हर महीने", "Hourly": "हर घंटे", "All": "सभी", "points": "पॉइंट", "on": "चालू",
    // tabs
    "Overview": "ओवरव्यू", "Agents": "एजेंट", "SEO audit": "SEO ऑडिट", "AI visibility": "AI विज़िबिलिटी", "⚡ Blitz": "⚡ ब्लिट्ज़",
    "AI Citations": "AI साइटेशन", "✎ Rewriter": "✎ रीराइटर", "Keywords": "कीवर्ड", "Schedules": "शेड्यूल", "Assistant": "असिस्टेंट",
    // overview
    "Quick start": "शुरुआत करें", "Three things to do first.": "सबसे पहले ये तीन काम करें।", "Audit your site": "अपनी साइट का ऑडिट करें",
    "Get an SEO score and fix list.": "SEO स्कोर और सुधारों की लिस्ट पाएँ।", "Run SEO audit": "SEO ऑडिट चलाएँ", "Check AI visibility": "AI विज़िबिलिटी जाँचें",
    "Can ChatGPT, Claude and Perplexity read you?": "क्या ChatGPT, Claude और Perplexity आपकी साइट पढ़ पाते हैं?", "Check now": "अभी जाँचें",
    "Create an agent": "एजेंट बनाएँ", "Upload a CSV and get proposals to approve.": "CSV अपलोड करें और मंज़ूरी के लिए सुझाव पाएँ।", "New agent": "नया एजेंट",
    "Connections": "कनेक्शन", "Connect your accounts so agents read live data instead of CSV exports.": "अपने अकाउंट जोड़ें ताकि एजेंट CSV की जगह लाइव डेटा पढ़ें।",
    "Recent audits": "हाल के ऑडिट", "No audits yet.": "अभी कोई ऑडिट नहीं।", "SEO score": "SEO स्कोर", "Agent runs": "एजेंट रन", "Pending approvals": "बाकी मंज़ूरियाँ",
    "No audit yet": "अभी ऑडिट नहीं", "No check yet": "अभी जाँच नहीं", "Connect Google": "Google जोड़ें", "Disconnect": "डिस्कनेक्ट", "Coming soon": "जल्द आ रहा है", "Connected": "जुड़ा हुआ",
    // agents
    "Built-in agents analyse a CSV export. \"Custom AI agent\" uses Claude with your role and rules.": "बिल्ट-इन एजेंट CSV एक्सपोर्ट का विश्लेषण करते हैं। \"Custom AI agent\" आपके रोल और नियमों के साथ Claude इस्तेमाल करता है।",
    "Create agent": "एजेंट बनाएँ", "Your agents": "आपके एजेंट", "Run agent": "एजेंट चलाएँ", "Load sample data": "सैंपल डेटा लोड करें", "Run history": "रन हिस्ट्री",
    "No runs yet.": "अभी कोई रन नहीं।", "No agents yet. Create your first one above.": "अभी कोई एजेंट नहीं। ऊपर अपना पहला एजेंट बनाएँ।", "Import from Search Console": "Search Console से इम्पोर्ट करें", "Import from GA4": "GA4 से इम्पोर्ट करें",
    // audits
    "SEO site audit": "SEO साइट ऑडिट", "14 on-page checks: title, meta, headings, alt text, speed, indexability and more.": "14 ऑन-पेज जाँचें: टाइटल, मेटा, हेडिंग, alt टेक्स्ट, स्पीड, इंडेक्सिंग और भी बहुत कुछ।",
    "Audit": "ऑडिट करें", "Check": "जाँचें", "AI search visibility (GEO)": "AI सर्च विज़िबिलिटी (GEO)",
    "Checks AI crawler access in robots.txt, llms.txt, structured data and answer-friendly content.": "robots.txt में AI क्रॉलर की पहुँच, llms.txt, स्ट्रक्चर्ड डेटा और जवाब देने लायक कंटेंट जाँचता है।",
    "score": "स्कोर",
    // blitz
    "⚡ Blitz — thousands of judgments per second": "⚡ ब्लिट्ज़ — हर सेकंड हज़ारों फ़ैसले",
    "A fast rules engine: every item gets one verdict from a fixed set (Keep / Change, Steal / Skip, Answered / No page). No AI call per item, so it costs $0 and runs in seconds.": "तेज़ नियम-आधारित इंजन: हर आइटम को तय विकल्पों में से एक फ़ैसला मिलता है (Keep / Change, Steal / Skip, Answered / No page)। हर आइटम पर AI कॉल नहीं होती, इसलिए खर्च $0 और नतीजे सेकंडों में।",
    "SEO + GEO (website)": "SEO + GEO (वेबसाइट)", "Ad teardown": "विज्ञापन विश्लेषण", "Pages": "पेज", "Run Blitz": "ब्लिट्ज़ चलाएँ", "Run teardown": "विश्लेषण चलाएँ", "Load sample ads": "सैंपल विज्ञापन लोड करें",
    "Pages read": "पढ़े गए पेज", "Judgments": "फ़ैसले", "Judgments / sec": "फ़ैसले / सेकंड", "To change": "बदलने हैं", "Elapsed": "समय", "Cost so far": "अब तक खर्च",
    // citations
    "AI citation tracking": "AI साइटेशन ट्रैकिंग",
    "Asks ChatGPT, Claude, Gemini and Perplexity the questions real buyers ask, then checks every answer: are you named, at what position, how positively, is your site cited — and who gets named instead.": "ChatGPT, Claude, Gemini और Perplexity से असली खरीदारों वाले सवाल पूछता है और हर जवाब जाँचता है: आपका नाम आया या नहीं, किस नंबर पर, कितने अच्छे तरीके से, आपकी साइट cite हुई या नहीं — और आपकी जगह किसका नाम आया।",
    "Run tracking": "ट्रैकिंग चलाएँ", "Past runs": "पिछले रन", "Answers read": "पढ़े गए जवाब", "Naming you": "आपका नाम लिया", "Skipping you": "आपको छोड़ा", "Citation rate": "साइटेशन रेट",
    "Answers naming you": "आपका नाम लेने वाले जवाब", "Answers skipping you": "आपको छोड़ने वाले जवाब", "Avg position": "औसत पोज़िशन", "Sentiment": "भावना", "Site cited as source": "साइट सोर्स के रूप में", "Answer": "जवाब",
    // rewriter
    "✎ Page rewriter": "✎ पेज रीराइटर",
    "Turns every \"Change\" verdict into a ready-to-paste draft: title, meta, H1, answer-first intro, FAQ and schema. Review each one — edit, approve or reject — then copy the approved HTML.": "हर \"Change\" फ़ैसले को पेस्ट करने लायक ड्राफ़्ट में बदलता है: टाइटल, मेटा, H1, सीधा जवाब देने वाला इंट्रो, FAQ और schema। हर ड्राफ़्ट देखें — एडिट, मंज़ूर या रिजेक्ट करें — फिर मंज़ूर HTML कॉपी करें।",
    "Rewrite": "दोबारा लिखें", "AI (Claude)": "AI (Claude)", "Rules (free, no key)": "नियम (फ़्री, बिना key)", "Past rewrites": "पिछले रीराइट", "Approve all": "सब मंज़ूर करें", "Copy approved HTML": "मंज़ूर HTML कॉपी करें", "No rewrites yet.": "अभी कोई रीराइट नहीं।",
    // keywords
    "Keywords & rankings": "कीवर्ड और रैंकिंग",
    "Opportunities and rank tracking from your Search Console data: keywords stuck on page 2, top-10 results with a weak title, and the positions you track over time.": "आपके Search Console डेटा से मौके और रैंक ट्रैकिंग: पेज 2 पर अटके कीवर्ड, कमज़ोर टाइटल वाले टॉप-10 नतीजे, और समय के साथ आपकी पोज़िशन।",
    "Find opportunities": "मौके खोजें", "Opportunities": "मौके", "Page 2": "पेज 2", "Low CTR": "कम CTR", "Top 3 push": "टॉप 3 तक", "Striking distance": "पेज 1 के करीब",
    "Tracked keywords": "ट्रैक किए गए कीवर्ड", "Update positions now": "पोज़िशन अभी अपडेट करें",
    "Add a daily \"Rank tracking\" schedule on the Schedules tab to record positions automatically.": "पोज़िशन अपने आप रिकॉर्ड करने के लिए शेड्यूल टैब में रोज़ का \"Rank tracking\" शेड्यूल जोड़ें।",
    "Keyword opportunity finder": "कीवर्ड मौका खोजक",
    // schedules
    "Schedules & alerts": "शेड्यूल और अलर्ट",
    "Run audits, Blitz and AI-citation tracking automatically. When a score moves by more than your threshold you get an alert here, on Slack/Discord (webhook) and by email.": "ऑडिट, ब्लिट्ज़ और AI-साइटेशन ट्रैकिंग अपने आप चलाएँ। जब स्कोर आपकी सीमा से ज़्यादा बदले, तो यहाँ, Slack/Discord (webhook) पर और ईमेल से अलर्ट मिलता है।",
    "Create schedule": "शेड्यूल बनाएँ", "Your schedules": "आपके शेड्यूल", "Alerts": "अलर्ट", "Mark all read": "सब पढ़ा हुआ करें", "No alerts yet.": "अभी कोई अलर्ट नहीं।", "No schedules yet.": "अभी कोई शेड्यूल नहीं।",
    "Alert when the score changes by at least": "अलर्ट तब भेजें जब स्कोर कम से कम इतना बदले:",
    "AI visibility (GEO)": "AI विज़िबिलिटी (GEO)", "⚡ Blitz (avg AI-citation chance)": "⚡ ब्लिट्ज़ (औसत AI-साइटेशन मौका)",
    "AI citations (needs engine keys)": "AI साइटेशन (engine keys चाहिए)", "Rank tracking (Search Console)": "रैंक ट्रैकिंग (Search Console)",
    // assistant
    "Marketing assistant": "मार्केटिंग असिस्टेंट", "Ask about your campaigns, audits and agent results. It reads your latest runs and audits.": "अपने कैंपेन, ऑडिट और एजेंट नतीजों के बारे में पूछें। यह आपके हाल के रन और ऑडिट पढ़ता है।",
    // landing page
    "Services": "सेवाएँ", "How it works": "यह कैसे काम करता है", "Pricing": "कीमत", "AI agents for digital marketing": "डिजिटल मार्केटिंग के लिए AI एजेंट",
    "Start free": "फ़्री शुरू करें", "Read the guide": "गाइड पढ़ें", "Our services": "हमारी सेवाएँ", "Four agent teams, one dashboard": "चार एजेंट टीमें, एक डैशबोर्ड",
    "Each team has 10 specialised agents with one job, one data source and one output.": "हर टीम में 10 खास एजेंट हैं — एक काम, एक डेटा सोर्स, एक नतीजा।",
    "From data to approved changes in 4 steps": "डेटा से मंज़ूर बदलाव तक 4 कदमों में", "Connect data": "डेटा जोड़ें", "Pick an agent": "एजेंट चुनें", "Review proposals": "सुझाव देखें", "Approve & log": "मंज़ूर करें और रिकॉर्ड रखें",
    "Upload exports from Search Console, Google Ads or Meta.": "Search Console, Google Ads या Meta के एक्सपोर्ट अपलोड करें।", "Use a built-in agent or write your own role and rules.": "बिल्ट-इन एजेंट इस्तेमाल करें या अपना रोल और नियम लिखें।",
    "Agents explain every change they suggest.": "एजेंट हर सुझाए गए बदलाव की वजह बताते हैं।", "Nothing goes live without you. Every run is logged.": "आपकी मंज़ूरी के बिना कुछ लाइव नहीं होता। हर रन रिकॉर्ड होता है।",
    "AI agents": "AI एजेंट", "Metrics tracked": "ट्रैक किए गए मेट्रिक्स", "Guardrails": "सुरक्षा नियम", "Channels": "चैनल", "Free guide": "फ़्री गाइड",
    "Agentic marketing, in one page": "एजेंटिक मार्केटिंग, एक पेज में", "Simple plans for every team": "हर टीम के लिए आसान प्लान", "Get started": "शुरू करें", "Start free trial": "फ़्री ट्रायल शुरू करें", "Contact us": "संपर्क करें", "Popular": "लोकप्रिय",
    "Ready to put your marketing on autopilot?": "क्या आप अपनी मार्केटिंग को ऑटोपायलट पर डालने के लिए तैयार हैं?", "Create your first agent in under 5 minutes.": "5 मिनट से कम में अपना पहला एजेंट बनाएँ।", "Open dashboard →": "डैशबोर्ड खोलें →",
    "Product": "प्रोडक्ट", "Resources": "संसाधन", "Print guide": "गाइड प्रिंट करें",
  };
  const PH = {
    "https://yourwebsite.com": "https://आपकी-वेबसाइट.com", "Agent name": "एजेंट का नाम", "Role (one sentence)": "रोल (एक वाक्य में)", "Rules and limits": "नियम और सीमाएँ",
    "Email": "ईमेल", "Password (min 8 chars)": "पासवर्ड (कम से कम 8 अक्षर)", "Name (sign-up only)": "नाम (सिर्फ़ साइन-अप के लिए)", "…or paste CSV here": "…या यहाँ CSV पेस्ट करें",
    "Name (optional)": "नाम (वैकल्पिक)", "Keywords to track, comma separated": "ट्रैक करने वाले कीवर्ड, कॉमा से अलग", "Brand name (e.g. Glowberry)": "ब्रांड का नाम",
    "Buyer questions, one per line": "खरीदारों के सवाल, हर लाइन में एक", "Alert email (needs SMTP on server)": "अलर्ट ईमेल (सर्वर पर SMTP चाहिए)",
  };

  const KEY = "seotool-lang";
  let lang = "en";
  try { lang = localStorage.getItem(KEY) || "en"; } catch {}
  const orig = new WeakMap(); // node -> original English text

  function translateNode(n) {
    if (n.nodeType === 3) {
      if (!orig.has(n)) { const t = n.nodeValue.trim(); if (!HI[t]) return; orig.set(n, n.nodeValue); }
      const en = orig.get(n);
      n.nodeValue = lang === "hi" ? en.replace(en.trim(), HI[en.trim()]) : en;
    } else if (n.nodeType === 1) {
      if (n.tagName === "SCRIPT" || n.tagName === "STYLE" || n.tagName === "TEXTAREA" && !n.placeholder) return;
      if (n.placeholder !== undefined && (PH[n.dataset.phEn || n.placeholder])) {
        n.dataset.phEn ||= n.placeholder;
        n.placeholder = lang === "hi" ? PH[n.dataset.phEn] : n.dataset.phEn;
      }
      for (const c of n.childNodes) translateNode(c);
    }
  }
  const apply = () => { document.documentElement.lang = lang; translateNode(document.body); btn.textContent = lang === "hi" ? "EN" : "हिं"; };

  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "btn ghost lang-btn"; btn.title = "Language / भाषा";
  btn.onclick = () => { lang = lang === "hi" ? "en" : "hi"; try { localStorage.setItem(KEY, lang); } catch {} apply(); };
  const navSlot = document.querySelector(".nav-in .links") || document.querySelector(".nav-in > div:last-child");
  (navSlot || document.body).prepend(btn);

  new MutationObserver((muts) => { if (lang !== "hi") return; for (const m of muts) for (const n of m.addedNodes) translateNode(n); })
    .observe(document.body, { childList: true, subtree: true });
  apply();
})();

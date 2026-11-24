// What each pattern is, and the bias it exploits. Shown in the on-page cards and the popup.

const DPD_PATTERNS = {
  urgency: {
    name: "Fake urgency",
    bias: "Loss aversion and time pressure",
    why: "A deadline makes passing on the offer feel like losing something, and time pressure pushes you to decide on gut feeling instead of comparing.",
  },
  scarcity: {
    name: "Scarcity or popularity claim",
    bias: "Scarcity heuristic and social proof",
    why: "'Only a few left' and 'others are looking at this' make an item seem more valuable and suggest you'll miss out if you wait.",
  },
  preticked: {
    name: "Pre-ticked add-on",
    bias: "Default effect",
    why: "Most people keep whatever is already selected, so a ticked box turns an extra cost into the default choice.",
  },
  drip: {
    name: "Drip pricing",
    bias: "Anchoring and commitment",
    why: "You judge the deal on the first, lower price. After investing time to reach checkout, you're less likely to back out when the fees appear.",
  },
  confirmshaming: {
    name: "Confirmshaming",
    bias: "Guilt and self-image",
    why: "The 'no' option is worded so that declining feels like admitting something bad about yourself.",
  },
  fakeref: {
    name: "Unverified 'was' price",
    bias: "Anchoring on a reference price",
    why: "A struck-through higher price sets an anchor, so the real price feels like a bargain, even if nobody ever paid the higher one.",
  },
};

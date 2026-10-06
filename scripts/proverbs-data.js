/* Proverb of the Day data. Paste the real list into PROVERBS.
   One object per proverb:
     { haw: "Hawaiian text",             // required; NFC; ʻokina (U+02BB) + kahakō
       en:  "Translation / definition",  // required; always shown
       explanation: "Optional meaning"   // optional; "Read the meaning" toggle is hidden without it
     }
   The daily pick is day-of-year % PROVERBS.length (see proverb.js).

   !! These five are SAMPLES. Verify wording and translations against ʻŌlelo Noʻeau (Pukui)
   before launch. */

export const PROVERBS = [
  {
    haw: "Ma ka hana ka ʻike.",
    en: "In working one learns.",
    explanation: "Knowledge comes from doing. You can listen and read, but real understanding grows when you practice, which is a fitting thought for anyone learning ʻōlelo Hawaiʻi a little each day.",
  },
  {
    haw: "ʻAʻohe pau ka ʻike i ka hālau hoʻokahi.",
    en: "All knowledge is not taught in the same school.",
    explanation: "No single teacher or place holds everything worth knowing. Be humble, keep learning from many people, and be willing to learn from others.",
  },
  {
    haw: "He aliʻi ka ʻāina; he kauwā ke kanaka.",
    en: "The land is a chief; man is its servant.",
    explanation: "The land provides for the people, so the people care for it in return. This is the root of the value of mālama ʻāina.",
  },
  {
    haw: "I ka ʻōlelo nō ke ola; i ka ʻōlelo nō ka make.",
    en: "In the word is life; in the word is death.",
  },
  {
    haw: "E kūlia i ka nuʻu.",
    en: "Strive for the summit.",
    explanation: "Aim high and keep reaching. Progress is made one step at a time.",
  },
];

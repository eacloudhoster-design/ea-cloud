export const legalLinks = [
  { label: "Terms of Service", href: "/legal/terms" },
  { label: "Privacy Policy", href: "/legal/privacy" },
  { label: "Cookie Policy", href: "/legal/cookies" },
  { label: "Cookie Settings", href: "/legal/cookie-settings" },
  { label: "Privacy Choices", href: "/legal/privacy-choices" },
];
export const helpLinks = [
  { label: "Support", href: "mailto:eacloudhoster@gmail.com" },
  { label: "Legal", href: "/legal/terms" },
  ...legalLinks.slice(1, 4),
  {
    label: "Do Not Sell or Share My Personal Information",
    href: "/legal/privacy-choices",
  },
];

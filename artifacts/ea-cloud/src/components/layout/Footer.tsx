import { legalLinks } from "@/privacy/legal-links";
import { Link } from "wouter";
import { logo } from "@/lib/branding";
import { SiX, SiInstagram, SiTelegram, SiDiscord } from "react-icons/si";

export function Footer() {
  return (
    <footer className="bg-black/50 border-t border-white/5 py-12">
      <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex items-center gap-4">
          <img
            src={logo}
            alt="EA Cloud"
            className="h-10 w-10 rounded-full object-cover grayscale opacity-70"
          />
          <div className="text-sm text-muted-foreground">
            <p className="font-bold text-white mb-1">EA CLOUD</p>
            <p>© {new Date().getFullYear()} EA Cloud. All rights reserved.</p>
          </div>
        </div>
        <div className="flex gap-6 text-muted-foreground">
          <a href="#" className="hover:text-primary transition-colors">
            <SiX className="w-5 h-5" />
          </a>
          <a href="#" className="hover:text-primary transition-colors">
            <SiInstagram className="w-5 h-5" />
          </a>
          <a href="#" className="hover:text-primary transition-colors">
            <SiTelegram className="w-5 h-5" />
          </a>
          <a href="#" className="hover:text-primary transition-colors">
            <SiDiscord className="w-5 h-5" />
          </a>
        </div>
      </div>
      <nav aria-label="Legal and privacy" className="legal-footer">
        <Link href="/legal">Legal &amp; Privacy Centre</Link>
        {legalLinks.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}

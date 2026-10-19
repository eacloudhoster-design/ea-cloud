import { Link } from "wouter";
import { logo } from "@/lib/branding";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-white/5">
      <div className="container mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-12">
          <Link href="/" className="flex items-center gap-3">
            <img src={logo} alt="EA Cloud" className="h-10 w-10 rounded-full object-cover shadow-[0_0_15px_rgba(227,30,36,0.3)]" />
            <span className="text-xl font-bold tracking-wider text-white">EA CLOUD</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/#download" className="hover:text-white transition-colors">App</Link>
            <Link href="/#features" className="hover:text-white transition-colors">Features</Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/login">
            <Button variant="ghost" className="text-white hover:bg-white/5">Sign In</Button>
          </Link>
          <Link href="/register">
            <Button className="bg-primary hover:bg-primary/90 text-white shadow-[0_0_15px_rgba(227,30,36,0.4)]">Get Started</Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

import { useRef } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import logo from "@assets/ea_cloud_1778700558655.jpg";
import { Button } from "@/components/ui/button";
import { ChevronDown, Shield, TrendingUp, BarChart3, Bot, Copy, Brain, Users, Zap, MessageCircle, Download } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const features = [
  { icon: TrendingUp, title: "Home Dashboard Access", desc: "Real-time overview of all trading activity and performance metrics." },
  { icon: BarChart3, title: "Portfolio Overview", desc: "Track your complete portfolio with live P&L, drawdown, and balance updates." },
  { icon: Zap, title: "Advanced Trading Tools", desc: "Precision tools built for professional traders — entries, exits, and risk management." },
  { icon: Brain, title: "Analytics", desc: "Deep performance analytics with historical data, win rates, and trade breakdowns." },
  { icon: Copy, title: "Copy Trading", desc: "Automatically copy signals from expert mentors directly to your MT4/MT5 account." },
  { icon: Bot, title: "AI Chart Scanner", desc: "Proprietary AI scans market structures and delivers high-probability trade setups." },
  { icon: Users, title: "Learn From Experienced Mentors", desc: "Access proven strategies from vetted mentors with real verified track records." },
  { icon: Shield, title: "Automated Trading Experience", desc: "Set and forget — EA Cloud runs autonomously while you focus on what matters." },
];

const faqs = [
  {
    q: "Is EA Cloud a trading robot?",
    a: "No, EA Cloud is not a trading robot. It is a copy trading ecosystem and mentor platform. EA Cloud connects mentors who execute trades with clients who automatically copy those trades to their own accounts.",
  },
  {
    q: "Which brokers does EA Cloud support?",
    a: "EA Cloud currently supports Exness, Razor Markets, JustMarkets, and Profin Wealth. More brokers are being added regularly.",
  },
  {
    q: "How can I get access to a license key?",
    a: "License keys are issued by mentors. Contact a mentor on the platform to receive your license key and get started with copy trading.",
  },
  {
    q: "What is a mentor verification code?",
    a: "The mentor verification code is a unique identifier that allows stop loss, take profit, and trading tactics to sync correctly from the mentor's account to all connected client accounts.",
  },
];

export default function Landing() {
  const downloadRef = useRef<HTMLDivElement>(null);

  const scrollToDownload = () => {
    downloadRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#080810] text-white overflow-x-hidden">
      {/* Animated background grid */}
      <div className="fixed inset-0 pointer-events-none z-0"
        style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(227,30,36,0.12) 0%, transparent 60%), linear-gradient(rgba(227,30,36,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(227,30,36,0.03) 1px, transparent 1px)", backgroundSize: "auto, 60px 60px, 60px 60px" }} />

      {/* Hero */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-8"
          style={{ animation: "float 4s ease-in-out infinite" }}
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl scale-150" />
            <img src={logo} alt="EA Cloud" className="relative w-28 h-28 rounded-full object-cover ring-2 ring-primary/50 shadow-[0_0_40px_rgba(227,30,36,0.5)]" />
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-6 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            AI-Powered Copy Trading Ecosystem
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 bg-gradient-to-b from-white via-white to-white/50 bg-clip-text text-transparent">
            Professional Trading<br />Made Simple
          </h1>
          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            EA Cloud connects expert mentors with aspiring traders through intelligent copy trading. Sync signals in real time, manage clients, and trade with confidence.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-white px-8 py-4 text-base font-semibold shadow-[0_0_30px_rgba(227,30,36,0.5)] hover:shadow-[0_0_50px_rgba(227,30,36,0.7)] transition-all duration-300 h-auto">
                Become a Mentor
              </Button>
            </Link>
            <Link href="/admin/login">
              <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/5 px-8 py-4 text-base font-semibold h-auto backdrop-blur-sm">
                Already a Member? Sign In
              </Button>
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-10 flex flex-col items-center gap-2 text-white/30 cursor-pointer"
          onClick={scrollToDownload}
        >
          <span className="text-xs uppercase tracking-widest">Scroll to explore</span>
          <ChevronDown className="w-5 h-5 animate-bounce" />
        </motion.div>
      </section>

      {/* App CTA Banner */}
      <section className="py-16 px-6 relative">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-black to-blue-900/10 p-10 text-center backdrop-blur-sm overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-blue-500/5" />
            <div className="relative">
              <Download className="w-10 h-10 text-primary mx-auto mb-4" />
              <h2 className="text-3xl font-bold mb-3">Download the EA Cloud App Now</h2>
              <p className="text-white/60 mb-6">Trade on the go. The EA Cloud mobile app puts your trading terminal in your pocket.</p>
              <Button onClick={scrollToDownload} size="lg" className="bg-primary hover:bg-primary/80 px-10 py-4 h-auto text-base font-semibold shadow-[0_0_20px_rgba(227,30,36,0.4)] transition-all duration-300">
                Get App
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Download Section */}
      <section ref={downloadRef} id="download" className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-4xl font-bold mb-4">Get the App</h2>
            <p className="text-white/50 mb-10">Available on iOS and Android. Free to download.</p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              {/* iOS */}
              <motion.a
                whileHover={{ scale: 1.05, y: -4 }}
                whileTap={{ scale: 0.97 }}
                href="/ea-app/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 px-8 py-4 rounded-xl border border-white/15 bg-white/5 backdrop-blur-sm hover:border-primary/40 hover:bg-primary/5 transition-all duration-300 group"
              >
                <div className="text-left">
                  <div className="text-xs text-white/50 uppercase tracking-wider">Tap to open</div>
                  <div className="text-lg font-semibold">Get iOS App</div>
                </div>
              </motion.a>

              {/* Android */}
              <motion.a
                whileHover={{ scale: 1.05, y: -4 }}
                whileTap={{ scale: 0.97 }}
                href="/ea-app/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 px-8 py-4 rounded-xl border border-white/15 bg-white/5 backdrop-blur-sm hover:border-primary/40 hover:bg-primary/5 transition-all duration-300 group"
              >
                <div className="text-left">
                  <div className="text-xs text-white/50 uppercase tracking-wider">Tap to open</div>
                  <div className="text-lg font-semibold">Get Android App</div>
                </div>
              </motion.a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <h2 className="text-4xl font-bold mb-4">Everything You Need to Trade Smart</h2>
            <p className="text-white/50 max-w-xl mx-auto">A complete ecosystem for modern copy trading — built for mentors and clients alike.</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ y: -6, scale: 1.02 }}
                className="group relative rounded-xl border border-white/8 bg-white/3 backdrop-blur-sm p-6 overflow-hidden cursor-default hover:border-primary/30 hover:bg-primary/5 transition-all duration-300"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <feature.icon className="w-8 h-8 text-primary mb-4 relative z-10" />
                <h3 className="font-semibold text-sm text-white mb-2 relative z-10">{feature.title}</h3>
                <p className="text-xs text-white/50 leading-relaxed relative z-10">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Everything You Need To Know<br />About EA Cloud</h2>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <Accordion type="single" collapsible className="space-y-3">
              {faqs.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`item-${i}`}
                  className="border border-white/10 rounded-xl bg-white/3 backdrop-blur-sm px-6 overflow-hidden"
                >
                  <AccordionTrigger className="text-left font-semibold py-5 hover:no-underline hover:text-primary transition-colors">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-white/60 pb-5 leading-relaxed">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-16px); }
        }
      `}</style>
    </div>
  );
}

"use client";

import { Facebook, Twitter, Instagram, Linkedin, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Footer = () => {
  return (
    <footer className="footer-root">
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
          {/* My Account Section */}
          <div>
            <h3 className="text-xl font-normal mb-6 section-title">My Account</h3>
            <ul className="space-y-4">
              {["Brands", "Gift Card", "Affiliates", "Specials", "My Reward"].map((item) => (
                <li key={item}>
                  <a href="#" className="link-item group">
                    <span className="link-text">{item}</span>
                    <span className="link-underline" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Policy Section */}
          <div>
            <h3 className="text-xl font-normal mb-6 section-title">Policy</h3>
            <ul className="space-y-4">
              {[
                "Terms & Conditions",
                "Returns Policy",
                "Shipping Policy",
                "Coupon Code Policy",
                "Privacy Policy",
              ].map((item) => (
                <li key={item}>
                  <a href="#" className="link-item group">
                    <span className="link-text">{item}</span>
                    <span className="link-underline" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Link Section */}
          <div>
            <h3 className="text-xl font-normal mb-6 section-title">Quick Link</h3>
            <ul className="space-y-4">
              {[
                "About Us",
                "FAQ",
                "Contact",
                "Seller Registration",
                "Agent Registration",
              ].map((item) => (
                <li key={item}>
                  <a href="#" className="link-item group">
                    <span className="link-text">{item}</span>
                    <span className="link-underline" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Support Section */}
          <div>
            <h3 className="text-xl font-normal mb-6 section-title">Support</h3>
            <div className="space-y-4 text-sm">
              <p>Ascent Retechno India Pvt Ltd</p>
              <p>
                Shop No.04, 05, 06 & 07 AV Crystal, Near Navneet Hospital, Opp.
                Achole Talav, Nallasopara East, Palghar, Maharashtra - 401209.
              </p>
              <a
                href="mailto:owegonline@oweg.in"
                className="link-item group inline-block mt-4"
              >
                <span className="link-text">owegonline@oweg.in</span>
                <span className="link-underline" />
              </a>
            </div>
          </div>

          {/* Connect With Us Section */}
          <div>
            <h3 className="text-xl font-normal mb-6 section-title">Connect With Us</h3>
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-normal mb-4">Subscribe</h4>
                <p className="text-sm mb-4">Get 10% off your first order</p>
                <div className="relative">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    className="email-input"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="send-btn"
                    aria-label="Send"
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-6">
                <a href="#" className="icon-link" aria-label="Facebook">
                  <Facebook className="h-6 w-6" />
                </a>
                <a href="#" className="icon-link" aria-label="Twitter">
                  <Twitter className="h-6 w-6" />
                </a>
                <a href="#" className="icon-link" aria-label="Instagram">
                  <Instagram className="h-6 w-6" />
                </a>
                <a href="#" className="icon-link" aria-label="LinkedIn">
                  <Linkedin className="h-6 w-6" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-top">
        <div className="container mx-auto px-6 py-6">
          <p className="text-center copyright hoverable">© 2025 OWEG. All right reserved</p>
        </div>
      </div>

      {/* Styles injected inside component - no external file needed */}
      <style jsx global>{`
        /* Font: put actual file at /public/fonts/OPTIHandelGothic-Light.woff2 for best result */
        @font-face {
          font-family: "OPTIHandelGothic-Light";
          src: url("/fonts/OPTIHandelGothic-Light.woff2") format("woff2");
          font-weight: 300;
          font-style: normal;
          font-display: swap;
        }

        :root {
          --footer-bg: #0b0b0b;
          --footer-text: #E6E6E6;
          --footer-hover: #7AC943;
          --footer-border: rgba(230, 230, 230, 0.06);
        }

        html, body, #__next {
          height: 100%;
        }
        body {
          margin: 0;
        }

        .footer-root {
          background: var(--footer-bg);
          color: var(--footer-text);
          font-family: "OPTIHandelGothic-Light", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
          font-weight: 300;
          margin-top: auto;
          box-sizing: border-box;
          width: 100%;
        }

        .footer-root .section-title {
          color: var(--footer-text);
          letter-spacing: 0.2px;
        }

        .footer-root .link-item {
          display: inline-block;
          position: relative;
          color: var(--footer-text);
          transition: color 240ms ease;
          text-decoration: none;
        }
        .footer-root .link-item .link-text {
          display: inline-block;
          transition: transform 240ms ease;
        }
        .footer-root .link-item .link-underline {
          position: absolute;
          left: 0;
          bottom: -6px;
          height: 2px;
          width: 0;
          background: var(--footer-hover);
          transition: width 280ms cubic-bezier(.2,.9,.2,1);
        }
        .footer-root .link-item:hover .link-text {
          transform: translateY(-3px);
        }
        .footer-root .link-item:hover .link-underline {
          width: 100%;
        }
        .footer-root .link-item:hover {
          color: var(--footer-hover);
        }

        .footer-root .email-input {
          background: transparent !important;
          border: 1px solid rgba(230,230,230,0.12);
          color: var(--footer-text) !important;
          padding-right: 3rem;
          padding-left: 1rem;
          height: 46px;
          border-radius: 8px;
          caret-color: var(--footer-hover);
        }
        .footer-root .email-input::placeholder {
          color: rgba(230,230,230,0.55) !important;
        }
        .footer-root .send-btn {
          position: absolute !important;
          right: 6px;
          top: 50%;
          transform: translateY(-50%);
          height: 38px;
          width: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--footer-text) !important;
          transition: color 200ms ease, transform 150ms ease;
        }
        .footer-root .send-btn:hover {
          color: var(--footer-hover) !important;
          transform: translateY(-50%) scale(1.03);
        }

        .footer-root .icon-link {
          color: var(--footer-text);
          transition: color 200ms ease, transform 200ms ease;
        }
        .footer-root .icon-link:hover {
          color: var(--footer-hover);
          transform: translateY(-3px);
        }

        .footer-root .border-top {
          border-top: 1px solid var(--footer-border);
        }

        .footer-root .copyright {
          color: rgba(230,230,230,0.6);
          font-size: 0.9rem;
          transition: color 250ms ease;
        }

        /* 👇 Hover color change effect on © text */
        .footer-root .copyright:hover {
          color: var(--footer-hover);
        }

        @media (max-width: 768px) {
          .footer-root .link-underline { bottom: -4px; }
        }
      `}</style>
    </footer>
  );
};

export default Footer;

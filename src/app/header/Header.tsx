"use client";

import { MapPin, Search, ShoppingCart, User, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import Image from "next/image";

const Header = () => {
  const categories = [
    "Home Appliances",
    "Kitchen Appliances",
    "Computer & Mobile Accessories",
    "Surveillance & Security",
    "Clothing",
    "Bags",
    "Hardware",
    "Toys & Games",
    "Health Care",
    "Stationery",
    "Beauty & Personal Care",
    "Jewellery",
    "Umbrellas"

  ];

  return (
    <header className="w-full header-root">
      {/* Top Bar */}
      <div className="bg-header-top-bg text-header-top-text py-2 text-center text-sm">
        <p>
          Get 10% Extra off! - Use Code <span className="font-semibold">OWEG10</span>{" "}
          <a href="#" className="underline hover:text-header-accent transition-colors">
            ShopNow
          </a>
        </p>
      </div>

      {/* Main Header */}
      <div className="bg-header-bg border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="text-3xl font-bold">
                <Link href="/" className="flex items-center logo-link">
                  <Image
                    src="/oweg_logo.png"
                    alt="OWEG"
                    width={100}
                    height={32}
                    className="h-8 w-auto"
                  />
                </Link>
              </div>
            </div>

            {/* Delivery Location */}
            <div className="hidden lg:flex items-center gap-2 text-sm location-block">
              <MapPin className="w-5 h-5 text-header-text" />
              <div>
                <p className="text-header-text text-xs">Deliver to John</p>
                <p className="text-header-text font-medium">Bangalore 560034</p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="flex-1 max-w-2xl">
              <div className="flex gap-2">
                <Select defaultValue="all">
                  <SelectTrigger className="w-24 bg-header-bg border-header-text/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="electronics">Electronics</SelectItem>
                    <SelectItem value="fashion">Fashion</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex-1 flex">
                  <Input
                    type="text"
                    placeholder="Search products..."
                    className="rounded-r-none border-header-text/20"
                  />
                  <Button className="rounded-l-none bg-header-accent hover:bg-header-accent/90 text-white">
                    <Search className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Login/Signup Buttons */}
            <div className="hidden md:flex items-center gap-3">
              <Link href="/login">
                <Button
                  variant="outline"
                  className="border-header-accent text-header-text hover:bg-header-accent hover:text-white transition-all duration-300"
                >
                  <User className="w-4 h-4 mr-2" />
                  Login
                </Button>
              </Link>
              <Link href="/signup">
                <Button className="bg-header-accent hover:bg-header-accent/90 text-white">
                  Sign Up
                </Button>
              </Link>
            </div>

            {/* Orders */}
            <div className="hidden lg:flex items-center gap-2 cursor-pointer group">
              <div className="text-right">
                <p className="text-xs text-header-text">Returns</p>
                <p className="text-sm font-medium text-header-text group-hover:text-header-accent transition-colors">
                  & Orders
                </p>
              </div>
            </div>

            {/* Cart */}
            <div className="flex items-center gap-2 cursor-pointer group">
              <div className="relative">
                <ShoppingCart className="w-6 h-6 text-header-text group-hover:text-header-accent transition-colors" />
                <span className="absolute -top-2 -right-2 bg-header-accent text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  0
                </span>
              </div>
              <span className="hidden lg:block text-sm font-medium text-header-text group-hover:text-header-accent transition-colors">
                Cart
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Bar */}
      <nav className="bg-header-nav-bg">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-6 overflow-x-auto">
            {/* All Button */}
            <button className="flex items-center gap-2 py-3 text-header-text hover:text-header-accent transition-colors whitespace-nowrap">
              <Menu className="w-5 h-5" />
              <span className="font-medium">All</span>
            </button>

            {/* Category Links */}
            {categories.map((category) => (
              <a
                key={category}
                href="#"
                className="nav-link relative py-3 text-sm text-header-text font-medium whitespace-nowrap transition-colors"
              >
                {category}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* Internal styles (no external file) */}
      <style jsx global>{`
        /* Font (place the file at /public/fonts/OPTIHandelGothic-Light.woff2 for best result) */
        @font-face {
          font-family: "OPTIHandelGothic-Light";
          src: url("/fonts/OPTIHandelGothic-Light.woff2") format("woff2");
          font-weight: 300;
          font-style: normal;
          font-display: swap;
        }

        :root {
          --header-accent: #7AC943;
          --header-top-bg: #000000; /* top promo bar */
          --header-top-text: #ffffff;
          --header-bg: #ffffff; /* main header background */
          --header-nav-bg: #efefef; /* nav background */
          --header-text: #111827; /* main header text */
          --header-muted: #6b7280;
          
        }

        /* Root header font + base */
        .header-root {
          font-family: "OPTIHandelGothic-Light", ui-sans-serif, system-ui, -apple-system,
            "Segoe UI", Roboto, "Helvetica Neue", Arial;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
          .header-root button,
.header-root .cursor-pointer {
  cursor: pointer !important;
}

        /* map utility classes used in markup */
        .bg-header-top-bg {
          background: var(--header-top-bg);
        }
        .text-header-top-text {
          color: var(--header-top-text);
        }
        .bg-header-bg {
          background: var(--header-bg);
        }
        .bg-header-nav-bg {
          background: var(--header-nav-bg);
        }
        .text-header-text {
          color: var(--header-text);
        }
        .text-header-accent {
          color: var(--header-accent);
        }
        .bg-header-accent {
          background: var(--header-accent);
        }

        /* Logo link hover: subtle upward move and accent on text if any */
        .logo-link:hover {
          transform: translateY(-2px);
          transition: transform 220ms ease;
        }

        /* Location block slightly muted */
        .location-block .text-header-text {
          color: var(--header-text);
        }
        .location-block .text-header-text:first-child {
          color: var(--header-muted);
        }

        /* NAV links: custom underline + hover color */
        .nav-link {
          position: relative;
          color: var(--header-text);
        }
        .nav-link::after {
          content: "";
          position: absolute;
          left: 0;
          bottom: 6px;
          height: 2px;
          width: 0%;
          background: var(--header-accent);
          transform-origin: left center;
          transition: width 260ms cubic-bezier(.2,.9,.2,1), opacity 200ms ease;
          opacity: 0;
        }
        .nav-link:hover {
          color: var(--header-accent);
        }
        .nav-link:hover::after {
          width: 100%;
          opacity: 1;
        }

        /* Top promo link hover */
        .bg-header-top-bg a:hover {
          color: var(--header-accent) !important;
        }

        /* Orders / Cart hover color already uses group-hover; ensure default text color */
        .group-hover\\:text-header-accent:hover,
        .group:hover .group-hover\\:text-header-accent {
          color: var(--header-accent);
        }

        /* select / input colors: ensure placeholder & border subtle */
        input::placeholder {
          color: rgba(0, 0, 0, 0.45);
        }

        /* small responsive tweaks - keep underline close to text on small screens */
        @media (max-width: 768px) {
          .nav-link::after {
            bottom: 4px;
          }
        }
      `}</style>
    </header>
  );
};

export default Header;

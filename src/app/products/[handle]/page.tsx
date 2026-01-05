// Basic Product Detail Page: Shows product information (basic UI as requested)

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchProductDetail } from "@/lib/medusa";
import { ProductDetailClient } from "./ProductDetailClient";

type PageProps = {
  params: Promise<{
    handle: string;
  }>;
  searchParams: Promise<{
    id?: string;
  }>;
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const { id } = await searchParams;
  
  const product = await fetchProductDetail(id || handle);

  if (!product) {
    return {
      title: "Product Not Found | OWEG",
    };
  }

  return {
    title: `${product.title} | OWEG`,
    description: product.subtitle || product.description || `Buy ${product.title} at OWEG`,
  };
}

export default async function ProductDetailPage({ params, searchParams }: PageProps) {
  const { handle } = await params;
  const { id } = await searchParams;

  const product = await fetchProductDetail(id || handle);

  if (!product) {
    notFound();
  }

  return <ProductDetailClient product={product} />;
}


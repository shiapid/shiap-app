import { ExperienceCatalog, type ExperienceCardData } from "@/components/experiences/experience-catalog";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ExperiencesPage() {
  const supabase = await createClient();
  const [{ data: categoryRows }, { data: productRows }, { data: packageRows }] = await Promise.all([
    supabase.from("shiap_experience_categories").select("id,slug,name,sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("shiap_experience_products").select("id,category_id,slug,title,tagline,description,duration,location_label,cover_image_url,highlights,is_demo,sort_order").eq("status", "published").order("sort_order"),
    supabase.from("shiap_experience_packages").select("id,product_id,title,price,price_label,pricing_basis,sort_order,is_demo").eq("status", "published").order("sort_order"),
  ]);
  const categories = (categoryRows ?? []) as { id: string; slug: string; name: string; sort_order: number }[];
  const packages = (packageRows ?? []) as { id: string; product_id: string; title: string; price: number; price_label: string; pricing_basis: string; sort_order: number; is_demo: boolean }[];
  const products = (productRows ?? []) as (Omit<ExperienceCardData, "category" | "packages"> & { category_id: string; sort_order: number })[];
  const items: ExperienceCardData[] = products.flatMap((product) => {
    const category = categories.find((item) => item.id === product.category_id);
    const productPackages = packages.filter((item) => item.product_id === product.id && !item.is_demo);
    if (!category || (!product.is_demo && !productPackages.length)) return [];
    return [{ ...product, category, packages: productPackages }];
  });
  const visibleCategories = categories.filter((category) => items.some((item) => item.category.slug === category.slug));
  return <ExperienceCatalog categories={visibleCategories} items={items}/>;
}

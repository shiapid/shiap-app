import {publicDestinations} from "@/lib/destinations/public";
import {PublicDestinationFilter} from "@/components/destinations/public-destination-filter";
import { ExperienceCatalog, type ExperienceCardData } from "@/components/experiences/experience-catalog";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ExperiencesPage({searchParams}:{searchParams:Promise<{destination?:string}>}) {
  const params=await searchParams;const selected=typeof params.destination==="string"?params.destination:"";const destinations=await publicDestinations();const destination=destinations.find(d=>d.slug===selected||d.id===selected);
  const supabase = await createClient();
  let productQuery=supabase.from("shiap_experience_products").select("id,destination_id,category_id,slug,title,tagline,description,duration,location_label,cover_image_url,highlights,is_demo,sort_order").eq("status","published").order("sort_order");
  if(selected)productQuery=productQuery.eq("destination_id",destination?.id||"00000000-0000-0000-0000-000000000000");
  const [{ data: categoryRows }, { data: productRows }, { data: packageRows }] = await Promise.all([
    supabase.from("shiap_experience_categories").select("id,slug,name,sort_order").eq("is_active", true).order("sort_order"),
    productQuery,
    supabase.from("shiap_experience_packages").select("id,product_id,title,price,price_label,pricing_basis,sort_order,is_demo").eq("status", "published").order("sort_order"),
  ]);
  const categories = (categoryRows ?? []) as { id: string; slug: string; name: string; sort_order: number }[];
  const packages = (packageRows ?? []) as { id: string; product_id: string; title: string; price: number; price_label: string; pricing_basis: string; sort_order: number; is_demo: boolean }[];
  const products = (productRows ?? []).map(row=>({...row,location_label:destinations.find(d=>d.id===row.destination_id)?.name||row.location_label})) as (Omit<ExperienceCardData, "category" | "packages"> & { category_id: string; sort_order: number })[];
  const items: ExperienceCardData[] = products.flatMap((product) => {
    const category = categories.find((item) => item.id === product.category_id);
    const productPackages = packages.filter((item) => item.product_id === product.id && !item.is_demo);
    if (!category || (!product.is_demo && !productPackages.length)) return [];
    return [{ ...product, category, packages: productPackages }];
  });
  const visibleCategories = categories.filter((category) => items.some((item) => item.category.slug === category.slug));
  return <ExperienceCatalog destinationFilter={<PublicDestinationFilter destinations={destinations} value={destination?.slug||selected} action="/experiences"/>} categories={visibleCategories} items={items}/>;
}

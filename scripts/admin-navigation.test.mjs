import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { adminLeafHref, adminLocation, adminMenu, experienceTab } from "../src/lib/admin/admin-navigation.ts";

const resolve = href => {
  const route = new URL(href, "https://app.shiap.id");
  return adminLocation(route.pathname, route.searchParams);
};

test("each Admin destination links to one existing page and highlights its menu item", () => {
  const seen = new Set();
  for (const group of adminMenu) {
    for (const item of group.items) {
      for (const entry of item.children ?? [item]) {
        assert(!seen.has(entry.href), entry.href);
        seen.add(entry.href);
        assert(existsSync("src/app" + entry.href.split("?")[0] + "/page.tsx"), entry.href);
        const current = resolve(entry.href);
        assert.equal(current?.group, group.title, entry.href);
        assert.equal(current?.item.id, item.id, entry.href);
        assert.equal(current?.leaf?.href ?? current?.item.href, entry.href);
      }
    }
  }
});

test("deep links and unknown panes resolve to the correct breadcrumb and default view", () => {
  assert.equal(resolve("/admin/bookings/sample")?.detail, "Detail Booking");
  assert.equal(resolve("/admin/places/premium/sample/preview")?.detail, "Pratinjau Properti");
  assert.equal(resolve("/admin/stay?view=unknown")?.leaf?.href, "/admin/stay");
  assert.equal(resolve("/admin/experiences?tab=operations")?.leaf?.label, "Add-on, Sesi & Resource");
  assert.equal(experienceTab("unknown"), "overview");
  assert.equal(resolve("/admin/places-unrelated"), undefined);
});

test("Stay links preserve property, room and date without carrying transient flags", () => {
  const search = new URLSearchParams("view=calendar&property=p&room=r&date=2026-11-21&filter=occupied&back=calendar");
  const current = adminLocation("/admin/stay", search);
  const blocks = current.item.children.find(leaf => leaf.view === "blocks");
  assert.equal(adminLeafHref(current.item, blocks, "/admin/stay", search),
    "/admin/stay?view=blocks&property=p&room=r&date=2026-11-21&filter=occupied");
});

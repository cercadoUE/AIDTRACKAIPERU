import { api, body } from "@/server/http";
import { requireActor } from "@/server/lib/auth";
import { donationInput } from "@/server/domain/schemas";
import { createDonation, listDonationsFor } from "@/server/services/donations";

export const GET = api(async (req, _c, repo) => {
  const actor = await requireActor(req);
  const donations = await listDonationsFor(repo, actor);
  const items = await repo.list("donationItems");
  return {
    donations: donations
      .map((d) => ({ ...d, items: items.filter((i) => i.donationId === d.id).map((i) => ({ product: i.product, quantity: i.quantity, unit: i.unit, reserved: i.reserved })) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
});

export const POST = api(
  async (req, _c, repo) => {
    const actor = await requireActor(req);
    const input = await body(req, donationInput);
    const r = await createDonation(repo, actor, input);
    return Response.json({ donation: r.donation, items: r.items }, { status: 201 });
  },
  { limit: [20, 60_000], key: "donation-create" },
);

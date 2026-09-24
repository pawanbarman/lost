// PostgREST select strings mirroring the Express Prisma `include`/`select`
// projections, plus response-sanitizing helpers that replicate the private-bit
// stripping the Express controllers performed at the edges.

export const USER_NARROW = "id,name";
export const USER_WITH_EMAIL = "id,name,email";

export const ITEM_FULL =
  "id,title,category,description,imageUrl,privateDetails,currentLocation,color,brand,model,uniqueFeatures,condition,size,createdAt,updatedAt";

export const ITEM_PUBLIC =
  "id,title,category,description,imageUrl,currentLocation,color,brand,model,uniqueFeatures,condition,size,createdAt,updatedAt";

export const REPORT_COLUMNS =
  "id,userId,itemId,type,location,eventId,communityId,dateTime,status,isFlagged,flaggedReason,createdAt,updatedAt";

export const REPORT_ITEM_USER = `${REPORT_COLUMNS},item:Item(${ITEM_FULL}),user:User(${USER_NARROW})`;

export const FULL_REPORT_SELECT =
  `${REPORT_COLUMNS},item:Item(${ITEM_FULL}),community:Community(*),event:Event(*),user:User(${USER_WITH_EMAIL})`;

export const MY_REPORTS_SELECT =
  `${REPORT_COLUMNS},item:Item(${ITEM_FULL}),community:Community(*)`;

export const EVENT_REPORTS_SELECT =
  `*,item:Item(${ITEM_FULL}),user:User(${USER_NARROW})`;

export const MATCH_DETAIL_SELECT =
  `*,lostReport:Report!Match_lostReportId_fkey(${REPORT_ITEM_USER}),foundReport:Report!Match_foundReportId_fkey(${REPORT_ITEM_USER})`;

export const MATCH_LIST_ITEM =
  `${REPORT_COLUMNS},item:Item(${ITEM_FULL})`;

export const MATCH_FOUND_FEED =
  `id,type,status,location,communityId,dateTime,createdAt,item:Item(id,title,category,description,imageUrl,currentLocation,color,brand,model,uniqueFeatures,condition,size),user:User(${USER_NARROW}),community:Community(id,name)`;

// Select used for claims. User subsets follow the viewer's role the same way
// matchIncludeForRole(role) did in claimController.
export function claimSelect(viewerRole: string): string {
  const u = viewerRole === "ADMIN" ? USER_WITH_EMAIL : USER_NARROW;
  const report = `${REPORT_COLUMNS},item:Item(${ITEM_FULL}),user:User(${u})`;
  return `*,claimant:User(${u}),match:Match(id,lostReportId,foundReportId,score,status,createdAt,lostReport:Report!Match_lostReportId_fkey(${report}),foundReport:Report!Match_foundReportId_fkey(${report}))`;
}

export function isAdmin(role: string | undefined): boolean {
  return role === "ADMIN";
}

function stripPrivate(item: Record<string, unknown> | null | undefined) {
  if (item && typeof item === "object") {
    const copy = { ...item };
    delete copy.privateDetails;
    return copy as Record<string, unknown>;
  }
  return item;
}

type Msg = Record<string, unknown> | null | undefined;

function withItemStripped(report: Msg): Msg {
  if (!report || typeof report !== "object") return report;
  const copy = { ...report, item: stripPrivate(report.item as Msg) };
  return copy;
}

function isReportOwner(report: Msg, viewer: { id?: string }) {
  return !!report && report.userId === viewer.id;
}

// Strips item.privateDetails unless the viewer owns the report or is an admin.
export function sanitizeReportForViewer(
  report: Msg,
  viewer: { id?: string; role?: string },
): Msg {
  if (!report) return report;
  if (isAdmin(viewer.role) || isReportOwner(report, viewer)) return report;
  return withItemStripped(report);
}

// Strips item.privateDetails on both sides of a match.
export function sanitizeMatchForViewer(
  match: Msg,
  viewer: { id?: string },
): Msg {
  if (!match || typeof match !== "object") return match;
  const copy = { ...match };
  const sanitizeSide = (report: Msg) => {
    if (!report || typeof report !== "object") return report;
    if (isReportOwner(report, viewer)) return report;
    return withItemStripped(report);
  };
  copy.lostReport = sanitizeSide(copy.lostReport as Msg);
  copy.foundReport = sanitizeSide(copy.foundReport as Msg);
  return copy;
}

// Non-admin viewers see neither adminNotes nor any privateDetails on either
// report side (claimant is the lost-item owner, but keep the Express behaviour).
export function sanitizeClaimForViewer(
  claim: Msg,
  viewer: { id?: string; role?: string },
): Msg {
  if (!claim || typeof claim !== "object") return claim;
  const copy = { ...claim };
  if (viewer.id && !isAdmin(viewer.role)) {
    delete (copy as Record<string, unknown>).adminNotes;
  }
  const match = copy.match as Record<string, unknown> | null | undefined;
  if (match && typeof match === "object") {
    match.lostReport = withItemStripped(match.lostReport as Msg);
    match.foundReport = withItemStripped(match.foundReport as Msg);
  }
  return copy;
}
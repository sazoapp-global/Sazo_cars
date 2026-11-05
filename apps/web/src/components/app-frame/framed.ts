// Pages drawn inside a side bar frame (5 Nov 2026): the workspaces, plus a dealer's Business details
// (/business/<id>) and the partner pages, which use the frame without being a workspace path. On these,
// Notifications and Settings open beside the side bar instead of in place of the whole page.
import { workspaceOf } from '@sazo/contracts';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FRAMED = [new RegExp(`^/business/${UUID}(/|$)`), /^\/partner(\/|$)/];

export const inSideBarFrame = (pathname: string) => !!workspaceOf(pathname) || FRAMED.some((r) => r.test(pathname));

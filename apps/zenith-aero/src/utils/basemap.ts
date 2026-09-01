/**
 * Where the map tiles come from.
 *
 * Every map in Aero drew its dark basemap from basemaps.cartocdn.com, which used to be
 * usable without a key and no longer is: CARTO now stamps "API KEY REQUIRED" diagonally
 * across every tile it serves anonymously. The heatmap was a wall of that text with the
 * athlete's routes drawn faintly on top.
 *
 * Esri's dark canvas is free and keyless, and Aero already depends on Esri for the
 * satellite layer, so this adds no new provider. The base carries no labels, so the
 * reference layer goes on top of it - that is how Esri intends the pair to be used, and
 * it keeps place names on the map where CARTO had them.
 *
 * Defined once because there were three copies of the CARTO URL and they would have had
 * to be found separately the next time a provider changed its terms.
 */

export const DARK_BASEMAP_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

/** Place names, drawn over the base. */
export const DARK_BASEMAP_LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}';

export const DARK_BASEMAP_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ';

export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const SATELLITE_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export const SATELLITE_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';

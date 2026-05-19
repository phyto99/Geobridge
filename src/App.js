import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Globe from 'react-globe.gl';
import { rewind } from '@turf/rewind';

const REGIONS = {
  north_america: ['CA', 'US', 'MX'],
  central_america_caribbean: [
    'GT', 'BZ', 'HN', 'SV', 'NI', 'CR', 'PA', 'CU', 'JM', 'HT',
    'DO', 'KN', 'AG', 'DM', 'LC', 'BB', 'VC', 'GD', 'BS'
  ],
  south_america: [
    'AR', 'BR', 'BO', 'CL', 'PY', 'UY', 'CO', 'EC', 'VE',
    'GY', 'SR', 'PE'
  ],
  southwest_europe: ['ES', 'PT', 'AD'],
  south_europe: ['IT', 'GR', 'MT', 'SM'],
  central_europe: ['DE', 'AT', 'LI', 'CH', 'PL', 'HU', 'SK', 'CZ', 'SI'],
  west_europe: ['GB', 'IE', 'NL', 'BE', 'LU', 'MC', 'FR'],
  north_europe: ['DK', 'IS', 'NO', 'SE', 'FI'],
  southeast_europe: ['AL', 'BA', 'HR', 'MK', 'ME', 'RS', 'RO', 'BG', 'XK'],
  east_europe: ['RU', 'EE', 'LV', 'LT', 'BY', 'UA', 'MD'],
  north_africa: ['EG', 'LY', 'DZ', 'MA', 'TN'],
  central_africa: ['TD', 'CF', 'CM', 'GQ', 'GA', 'CG', 'CD', 'AO'],
  east_africa: [
    'SD', 'ER', 'DJ', 'SO', 'ET', 'SS', 'KE', 'UG', 'TZ',
    'RW', 'BI', 'ZM', 'MW', 'MZ', 'ZW', 'KM', 'MG'
  ],
  west_africa: [
    'EH', 'MR', 'ML', 'SN', 'GM', 'GW', 'GN', 'SL', 'LR',
    'CI', 'GH', 'TG', 'BJ', 'BF', 'NE', 'NG'
  ],
  south_africa: ['NA', 'BW', 'ZA', 'SZ', 'LS'],
  middle_east: [
    'GE', 'CY', 'TR', 'SY', 'LB', 'AZ', 'AM', 'IR', 'IQ',
    'IL', 'JO', 'SA', 'YE', 'OM', 'BH', 'QA', 'AE', 'KW', 'PS'
  ],
  indian_subcontinent: ['IN', 'AF', 'PK', 'NP', 'BD', 'BT', 'LK'],
  central_asia: ['KZ', 'UZ', 'TM', 'TJ', 'KG'],
  eastern_asia: [
    'CN', 'KP', 'KR', 'JP', 'MM', 'TH', 'KH', 'VN', 'LA',
    'ID', 'PH', 'PG', 'MY', 'CN-TW', 'MN'
  ],
  oceania: ['AU', 'NZ', 'FJ', 'VU', 'SB', 'PW', 'NR', 'MH', 'WS', 'TO', 'KI'],
  antarctica: ['AQ']
};

const REGION_DISPLAY_NAMES = {
  north_america: 'North America',
  central_america_caribbean: 'Central America & Caribbean',
  south_america: 'South America',
  southwest_europe: 'Southwest Europe',
  south_europe: 'South Europe',
  central_europe: 'Central Europe',
  west_europe: 'West Europe',
  north_europe: 'North Europe',
  southeast_europe: 'Southeast Europe',
  east_europe: 'East Europe',
  north_africa: 'North Africa',
  central_africa: 'Central Africa',
  east_africa: 'East Africa',
  west_africa: 'West Africa',
  south_africa: 'South Africa',
  middle_east: 'Middle East',
  indian_subcontinent: 'Indian Subcontinent',
  central_asia: 'Central Asia',
  eastern_asia: 'Eastern Asia',
  oceania: 'Oceania',
  antarctica: 'Antarctica',
};

// Pre-calculate region mapping for O(1) lookups
const REGION_MAPPING = Object.entries(REGIONS).reduce((acc, [region, countries]) => {
  countries.forEach(country => {
    acc[country] = region;
  });
  return acc;
}, {});

// Excluded countries set for O(1) lookups
const EXCLUDED_COUNTRIES = new Set([
  'MU', 'JE', 'GG', 'IM', 'FO', 'AX', 'PM', 'CV', 'GS', 'MV', 'IO', 'MP', 'FM',
  'SC', 'NF', 'ST', 'SH', 'BM', 'TV', 'AS', 'NU', 'CK', 'PF', 'PN', 'WF', 'TC',
  'KY', 'AW', 'CW', 'VI', 'VG', 'AI', 'MF', 'SX', 'BL', 'MS', 'HM', 'TF', 'GL', 'XN', '-99'
]);

// Team color name lookup
const TEAM_COLOR_NAMES = {
  '#00FFFF': 'cyan', '#FF00FF': 'magenta', '#00FF00': 'lime',
  '#FF8800': 'orange', '#FF0000': 'red', '#0080FF': 'blue',
  '#FFFF00': 'yellow', '#FF8080': 'pink', '#FFFFFF': 'white'
};
const getTeamColorName = (color) =>
  TEAM_COLOR_NAMES[(color || '').toUpperCase()] || TEAM_COLOR_NAMES[color] || color || 'team';

// Manual mapping for problematic countries
const MANUAL_COUNTRY_MAPPING = {
  'Norway': 'NO',
  'France': 'FR',
  'Kosovo': 'XK',
  'Somaliland': 'XS',
  'Northern Cyprus': 'XN'
};

// Optimized country code extraction
const getCountryCode = (country) => {
  const iso2 = country.properties?.ISO_A2;
  const admin = country.properties?.ADMIN;
  const name = country.properties?.NAME;

  if (iso2 && iso2 !== '-99' && iso2 !== 'n/a') {
    return iso2;
  }

  return MANUAL_COUNTRY_MAPPING[admin] || MANUAL_COUNTRY_MAPPING[name] || iso2;
};

// Memoized polygon data generation
const createPolygonData = (countries) => {
  const surfaceOutlines = countries.map((feature, index) => ({
    ...feature,
    __layer: 'surface',
    __id: `surface_${index}`
  }));

  const elevatedCountries = countries.map((feature, index) => ({
    ...feature,
    __layer: 'elevated',
    __id: `elevated_${index}`
  }));

  return [...surfaceOutlines, ...elevatedCountries];
};

// Manual region boundary generator using REGIONS object
const createManualRegionBoundaries = (countries) => {
  const boundaries = [];

  // Create boundaries based on manual REGIONS object
  const regionEntries = Object.entries(REGIONS);

  for (let i = 0; i < regionEntries.length; i++) {
    for (let j = i + 1; j < regionEntries.length; j++) {
      const [region1Name, region1Countries] = regionEntries[i];
      const [region2Name, region2Countries] = regionEntries[j];

      // Find countries from the data that match our manual regions
      const region1Features = countries.filter(country => {
        const code = getCountryCode(country);
        return region1Countries.includes(code);
      });

      const region2Features = countries.filter(country => {
        const code = getCountryCode(country);
        return region2Countries.includes(code);
      });

      // Find shared boundaries between regions
      region1Features.forEach(country1 => {
        region2Features.forEach(country2 => {
          const coords1 = extractCoordinates(country1.geometry);
          const coords2 = extractCoordinates(country2.geometry);
          const sharedBoundary = findSharedBoundary(coords1, coords2);

          if (sharedBoundary.length >= 2) {
            boundaries.push({
              coordinates: sharedBoundary,
              regions: [region1Name, region2Name],
              countries: [
                getCountryCode(country1),
                getCountryCode(country2)
              ],
              id: `boundary_${region1Name}_${region2Name}_${boundaries.length}`,
              type: 'manual_boundary'
            });
          }
        });
      });
    }
  }

  return boundaries;
};

// Data-driven region boundary generator using GeoJSON properties
const createDataDrivenRegionBoundaries = (countries) => {
  const boundaries = [];

  // Create regions based on actual geographic data
  const createDataDrivenRegions = (countries) => {
    const regionMap = new Map();

    countries.forEach(country => {
      const continent = country.properties.CONTINENT || 'Unknown';
      const subregion = country.properties.SUBREGION || country.properties.REGION_UN || 'Unknown';
      const countryCode = getCountryCode(country);



      // Create a more natural regional grouping
      let regionKey;
      if (continent === 'Europe') {
        // Use more detailed European subregions
        regionKey = `europe_${subregion}`.toLowerCase().replace(/[\s&]+/g, '_');
      } else if (continent === 'Africa') {
        // Group African countries by UN subregions
        regionKey = `africa_${subregion}`.toLowerCase().replace(/[\s&]+/g, '_');
      } else if (continent === 'Asia') {
        // Use detailed Asian subregions
        regionKey = `asia_${subregion}`.toLowerCase().replace(/[\s&]+/g, '_');
      } else if (continent === 'North America') {
        // Group North American countries by subregion
        if (subregion === 'Northern America') {
          regionKey = 'north_america';
        } else {
          regionKey = 'central_america_caribbean';
        }
      } else if (continent === 'South America') {
        regionKey = 'south_america';
      } else if (continent === 'Oceania') {
        regionKey = `oceania_${subregion}`.toLowerCase().replace(/[\s&]+/g, '_');
      } else {
        regionKey = continent.toLowerCase().replace(/[\s&]+/g, '_');
      }

      if (!regionMap.has(regionKey)) {
        regionMap.set(regionKey, []);
      }
      regionMap.get(regionKey).push(country);
    });

    return regionMap;
  };

  const dataRegions = createDataDrivenRegions(countries);

  // Create boundary data by finding adjacent countries from different regions
  const regionArray = Array.from(dataRegions.entries());

  for (let i = 0; i < regionArray.length; i++) {
    for (let j = i + 1; j < regionArray.length; j++) {
      const [region1Name, region1Countries] = regionArray[i];
      const [region2Name, region2Countries] = regionArray[j];

      // Find countries that are geographically adjacent between regions
      region1Countries.forEach(country1 => {
        region2Countries.forEach(country2 => {
          // Check if countries share a border by examining coordinate proximity
          const coords1 = extractCoordinates(country1.geometry);
          const coords2 = extractCoordinates(country2.geometry);

          const sharedBoundary = findSharedBoundary(coords1, coords2);

          if (sharedBoundary.length >= 2) {
            boundaries.push({
              coordinates: sharedBoundary,
              regions: [region1Name, region2Name],
              countries: [
                getCountryCode(country1),
                getCountryCode(country2)
              ],
              id: `boundary_${region1Name}_${region2Name}_${boundaries.length}`,
              type: 'data_driven_boundary'
            });
          }
        });
      });
    }
  }

  return boundaries;
};

// Helper function to extract coordinates from geometry
const extractCoordinates = (geometry) => {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates[0]; // Outer ring
  } else if (geometry.type === 'MultiPolygon') {
    // Return coordinates from the largest polygon
    let largestPolygon = geometry.coordinates[0];
    let maxLength = largestPolygon[0].length;

    geometry.coordinates.forEach(polygon => {
      if (polygon[0].length > maxLength) {
        largestPolygon = polygon;
        maxLength = polygon[0].length;
      }
    });

    return largestPolygon[0]; // Outer ring of largest polygon
  }
  return [];
};

// Helper function to find shared boundary points between two coordinate arrays
const findSharedBoundary = (coords1, coords2, tolerance = 0.01) => {
  const sharedPoints = [];
  const usedIndices = new Set();

  coords1.forEach((coord1, i1) => {
    coords2.forEach((coord2, i2) => {
      if (usedIndices.has(i2)) return;

      const distance = Math.sqrt(
        Math.pow(coord1[0] - coord2[0], 2) +
        Math.pow(coord1[1] - coord2[1], 2)
      );

      if (distance < tolerance) {
        sharedPoints.push(coord1);
        usedIndices.add(i2);
      }
    });
  });

  // Sort shared points to create a coherent boundary line
  if (sharedPoints.length >= 2) {
    return sortBoundaryPoints(sharedPoints);
  }

  return sharedPoints;
};

// Helper function to sort boundary points into a coherent line
const sortBoundaryPoints = (points) => {
  if (points.length <= 2) return points;

  const sorted = [points[0]];
  const remaining = points.slice(1);

  while (remaining.length > 0) {
    const lastPoint = sorted[sorted.length - 1];
    let closestIndex = 0;
    let minDistance = Infinity;

    remaining.forEach((point, index) => {
      const distance = Math.sqrt(
        Math.pow(lastPoint[0] - point[0], 2) +
        Math.pow(lastPoint[1] - point[1], 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = index;
      }
    });

    sorted.push(remaining[closestIndex]);
    remaining.splice(closestIndex, 1);
  }

  return sorted;
};

// ISO2 to ISO3 country code mapping for World Bank data
const ISO2_TO_ISO3 = {
  'AD': 'AND', 'AE': 'ARE', 'AF': 'AFG', 'AG': 'ATG', 'AI': 'AIA', 'AL': 'ALB', 'AM': 'ARM',
  'AO': 'AGO', 'AQ': 'ATA', 'AR': 'ARG', 'AS': 'ASM', 'AT': 'AUT', 'AU': 'AUS', 'AW': 'ABW',
  'AX': 'ALA', 'AZ': 'AZE', 'BA': 'BIH', 'BB': 'BRB', 'BD': 'BGD', 'BE': 'BEL', 'BF': 'BFA',
  'BG': 'BGR', 'BH': 'BHR', 'BI': 'BDI', 'BJ': 'BEN', 'BL': 'BLM', 'BM': 'BMU', 'BN': 'BRN',
  'BO': 'BOL', 'BQ': 'BES', 'BR': 'BRA', 'BS': 'BHS', 'BT': 'BTN', 'BV': 'BVT', 'BW': 'BWA',
  'BY': 'BLR', 'BZ': 'BLZ', 'CA': 'CAN', 'CC': 'CCK', 'CD': 'COD', 'CF': 'CAF', 'CG': 'COG',
  'CH': 'CHE', 'CI': 'CIV', 'CK': 'COK', 'CL': 'CHL', 'CM': 'CMR', 'CN': 'CHN', 'CO': 'COL',
  'CR': 'CRI', 'CU': 'CUB', 'CV': 'CPV', 'CW': 'CUW', 'CX': 'CXR', 'CY': 'CYP', 'CZ': 'CZE',
  'DE': 'DEU', 'DJ': 'DJI', 'DK': 'DNK', 'DM': 'DMA', 'DO': 'DOM', 'DZ': 'DZA', 'EC': 'ECU',
  'EE': 'EST', 'EG': 'EGY', 'EH': 'ESH', 'ER': 'ERI', 'ES': 'ESP', 'ET': 'ETH', 'FI': 'FIN',
  'FJ': 'FJI', 'FK': 'FLK', 'FM': 'FSM', 'FO': 'FRO', 'FR': 'FRA', 'GA': 'GAB', 'GB': 'GBR',
  'GD': 'GRD', 'GE': 'GEO', 'GF': 'GUF', 'GG': 'GGY', 'GH': 'GHA', 'GI': 'GIB', 'GL': 'GRL',
  'GM': 'GMB', 'GN': 'GIN', 'GP': 'GLP', 'GQ': 'GNQ', 'GR': 'GRC', 'GS': 'SGS', 'GT': 'GTM',
  'GU': 'GUM', 'GW': 'GNB', 'GY': 'GUY', 'HK': 'HKG', 'HM': 'HMD', 'HN': 'HND', 'HR': 'HRV',
  'HT': 'HTI', 'HU': 'HUN', 'ID': 'IDN', 'IE': 'IRL', 'IL': 'ISR', 'IM': 'IMN', 'IN': 'IND',
  'IO': 'IOT', 'IQ': 'IRQ', 'IR': 'IRN', 'IS': 'ISL', 'IT': 'ITA', 'JE': 'JEY', 'JM': 'JAM',
  'JO': 'JOR', 'JP': 'JPN', 'KE': 'KEN', 'KG': 'KGZ', 'KH': 'KHM', 'KI': 'KIR', 'KM': 'COM',
  'KN': 'KNA', 'KP': 'PRK', 'KR': 'KOR', 'KW': 'KWT', 'KY': 'CYM', 'KZ': 'KAZ', 'LA': 'LAO',
  'LB': 'LBN', 'LC': 'LCA', 'LI': 'LIE', 'LK': 'LKA', 'LR': 'LBR', 'LS': 'LSO', 'LT': 'LTU',
  'LU': 'LUX', 'LV': 'LVA', 'LY': 'LBY', 'MA': 'MAR', 'MC': 'MCO', 'MD': 'MDA', 'ME': 'MNE',
  'MF': 'MAF', 'MG': 'MDG', 'MH': 'MHL', 'MK': 'MKD', 'ML': 'MLI', 'MM': 'MMR', 'MN': 'MNG',
  'MO': 'MAC', 'MP': 'MNP', 'MQ': 'MTQ', 'MR': 'MRT', 'MS': 'MSR', 'MT': 'MLT', 'MU': 'MUS',
  'MV': 'MDV', 'MW': 'MWI', 'MX': 'MEX', 'MY': 'MYS', 'MZ': 'MOZ', 'NA': 'NAM', 'NC': 'NCL',
  'NE': 'NER', 'NF': 'NFK', 'NG': 'NGA', 'NI': 'NIC', 'NL': 'NLD', 'NO': 'NOR', 'NP': 'NPL',
  'NR': 'NRU', 'NU': 'NIU', 'NZ': 'NZL', 'OM': 'OMN', 'PA': 'PAN', 'PE': 'PER', 'PF': 'PYF',
  'PG': 'PNG', 'PH': 'PHL', 'PK': 'PAK', 'PL': 'POL', 'PM': 'SPM', 'PN': 'PCN', 'PR': 'PRI',
  'PS': 'PSE', 'PT': 'PRT', 'PW': 'PLW', 'PY': 'PRY', 'QA': 'QAT', 'RE': 'REU', 'RO': 'ROU',
  'RS': 'SRB', 'RU': 'RUS', 'RW': 'RWA', 'SA': 'SAU', 'SB': 'SLB', 'SC': 'SYC', 'SD': 'SDN',
  'SE': 'SWE', 'SG': 'SGP', 'SH': 'SHN', 'SI': 'SVN', 'SJ': 'SJM', 'SK': 'SVK', 'SL': 'SLE',
  'SM': 'SMR', 'SN': 'SEN', 'SO': 'SOM', 'SR': 'SUR', 'SS': 'SSD', 'ST': 'STP', 'SV': 'SLV',
  'SX': 'SXM', 'SY': 'SYR', 'SZ': 'SWZ', 'TC': 'TCA', 'TD': 'TCD', 'TF': 'ATF', 'TG': 'TGO',
  'TH': 'THA', 'TJ': 'TJK', 'TK': 'TKL', 'TL': 'TLS', 'TM': 'TKM', 'TN': 'TUN', 'TO': 'TON',
  'TR': 'TUR', 'TT': 'TTO', 'TV': 'TUV', 'TW': 'TWN', 'TZ': 'TZA', 'UA': 'UKR', 'UG': 'UGA',
  'UM': 'UMI', 'US': 'USA', 'UY': 'URY', 'UZ': 'UZB', 'VA': 'VAT', 'VC': 'VCT', 'VE': 'VEN',
  'VG': 'VGB', 'VI': 'VIR', 'VN': 'VNM', 'VU': 'VUT', 'WF': 'WLF', 'WS': 'WSM', 'YE': 'YEM',
  'YT': 'MYT', 'ZA': 'ZAF', 'ZM': 'ZMB', 'ZW': 'ZWE'
};

// ── Hardcoded index data (stable, changes ~once/year) ─────────────────────────

const HDI_DATA = {
  'NO':0.966,'IS':0.959,'CH':0.962,'HK':0.956,'AU':0.946,'SE':0.952,'IE':0.950,'DE':0.942,
  'NL':0.941,'FI':0.940,'SG':0.939,'BE':0.937,'NZ':0.939,'DK':0.948,'CA':0.935,'AT':0.926,
  'US':0.927,'LU':0.930,'GB':0.929,'KR':0.929,'JP':0.920,'SI':0.926,'CZ':0.900,'EE':0.899,
  'IT':0.906,'ES':0.911,'MT':0.918,'GR':0.893,'CY':0.899,'PL':0.876,'LT':0.879,'LV':0.879,
  'PT':0.866,'SK':0.855,'HU':0.851,'HR':0.878,'FR':0.910,'IL':0.919,'AE':0.937,'BH':0.888,
  'QA':0.855,'SA':0.875,'KW':0.847,'OM':0.816,'ME':0.832,'RS':0.805,'BY':0.801,'RU':0.821,
  'TT':0.810,'UY':0.830,'AR':0.849,'CL':0.860,'PA':0.820,'CR':0.806,'BA':0.779,'AL':0.789,
  'TR':0.855,'CN':0.788,'MX':0.781,'MK':0.770,'MY':0.803,'TH':0.800,'KZ':0.802,'UA':0.789,
  'GE':0.814,'AM':0.786,'AZ':0.764,'MD':0.763,'BR':0.760,'CO':0.752,'PE':0.762,'EC':0.765,
  'DO':0.767,'JM':0.706,'BZ':0.683,'SV':0.675,'NI':0.667,'IR':0.780,'JO':0.720,'LB':0.706,
  'IQ':0.686,'EG':0.728,'LY':0.718,'TN':0.732,'DZ':0.745,'MA':0.698,'IN':0.644,'BD':0.670,
  'LK':0.780,'PH':0.710,'ID':0.713,'VN':0.726,'MN':0.741,'TM':0.745,'UZ':0.727,'KG':0.701,
  'TJ':0.685,'ZA':0.717,'BO':0.698,'PY':0.726,'GY':0.720,'SR':0.705,'FJ':0.730,'WS':0.707,
  'TO':0.740,'GA':0.684,'CG':0.596,'GQ':0.596,'NA':0.615,'BW':0.693,'KE':0.601,'CM':0.587,
  'GH':0.602,'GT':0.627,'HN':0.620,'VE':0.699,'MM':0.585,'KH':0.600,'LA':0.620,'NP':0.601,
  'SN':0.517,'HT':0.548,'SD':0.516,'NG':0.548,'ET':0.492,'UG':0.550,'RW':0.548,'ZW':0.550,
  'MW':0.512,'SL':0.477,'LR':0.456,'GN':0.465,'GW':0.461,'MG':0.487,'LS':0.494,'SZ':0.601,
  'CV':0.661,'GM':0.527,'TG':0.547,'BJ':0.525,'DJ':0.520,'MR':0.541,'KM':0.558,'CD':0.481,
  'CF':0.387,'TD':0.394,'BI':0.426,'SS':0.381,'ER':0.492,'ML':0.410,'NE':0.394,'AF':0.462,
  'PK':0.544,'YE':0.455,'SO':0.380,'MZ':0.456,'ZM':0.565,'AO':0.590,'CI':0.534,'BF':0.449,
  'PG':0.567,'VU':0.607,'MU':0.796,'SC':0.796,'TL':0.607,'BN':0.829,'CU':0.764,'PS':0.715,
  'KP':0.733,'TW':0.926,'SY':0.557,'MV':0.762,'BB':0.814,'BS':0.820,'AG':0.826,'DM':0.743,
  'GD':0.793,'KN':0.778,'LC':0.742,'VC':0.738,'BT':0.681,'SB':0.543,'KI':0.630,'TV':0.641,
  'NR':0.703,'MH':0.639,'FM':0.628,'PW':0.767,'RO':0.827,'MK':0.770,'XK':0.742,
};

const DEMOCRACY_DATA = {
  'NO':9.81,'NZ':9.61,'IS':9.45,'SE':9.39,'FI':9.30,'DK':9.28,'CH':9.14,'IE':9.05,
  'AU':9.01,'NL':9.00,'LU':8.92,'CA':8.88,'DE':8.80,'GB':8.78,'AT':8.61,'MT':8.54,
  'MU':8.14,'JP':8.40,'CR':8.16,'PT':8.16,'UY':8.10,'ES':8.08,'KR':8.09,'FR':7.99,
  'IT':7.98,'US':7.85,'BE':7.89,'EE':7.90,'SI':8.00,'CZ':7.83,'MY':7.30,'ZA':7.19,
  'JM':7.17,'BR':6.67,'AR':7.02,'LT':7.18,'LV':7.24,'SK':7.35,'GH':6.43,'CL':7.77,
  'GR':7.72,'CY':7.59,'TT':7.06,'PA':6.84,'SG':6.22,'MX':6.06,'KE':5.68,'IN':7.04,
  'IL':7.84,'ID':6.53,'PH':6.62,'HU':6.64,'MK':5.30,'BA':4.98,'UA':5.42,'MD':6.53,
  'GE':5.40,'AR':7.02,'BO':5.87,'CO':6.35,'DO':6.21,'EC':5.87,'GT':5.88,'HN':4.59,
  'SV':5.79,'PY':6.27,'PE':5.93,'SN':5.71,'TZ':5.16,'MG':5.30,'ZM':5.47,'NA':6.31,
  'TN':5.50,'AL':5.91,'ME':6.01,'RS':5.67,'TH':6.67,'ID':6.53,'MN':6.27,'TL':7.06,
  'PG':6.32,'FJ':5.69,'VU':6.93,'WS':6.23,'BW':7.81,'LK':5.67,'BH':2.61,'KW':3.18,
  'JO':3.38,'MA':4.84,'DZ':3.73,'TN':5.50,'NG':4.23,'BD':5.99,'NP':4.50,'PK':4.24,
  'TR':4.35,'LB':3.45,'IQ':3.43,'KG':3.45,'MR':3.50,'ML':2.88,'GN':2.67,'BF':2.30,
  'CI':3.01,'TG':2.43,'BJ':4.80,'GH':6.43,'CM':2.79,'KE':5.68,'UG':4.12,'RW':2.89,
  'ET':2.28,'CD':2.15,'ZW':3.16,'SD':2.81,'GQ':1.84,'AZ':2.72,'KZ':2.20,'AM':4.00,
  'UZ':2.12,'TJ':1.33,'TM':1.66,'BY':1.55,'RU':2.22,'CN':1.77,'IR':1.73,'SY':1.43,
  'YE':2.18,'AF':0.32,'SA':2.08,'AE':2.90,'QA':3.09,'OM':3.17,'CU':2.09,'LA':1.77,
  'MM':1.02,'KP':1.08,'VN':2.63,'EG':2.93,'LY':2.28,'SS':1.89,'SO':2.39,'ER':2.11,
};

const PRESS_FREEDOM_DATA = {
  'NO':91.89,'DK':89.60,'SE':88.32,'NL':87.73,'FI':86.55,'EE':86.44,'IE':85.59,'CH':84.01,
  'LU':83.45,'AU':81.97,'IS':82.10,'DE':79.60,'LT':76.89,'CA':76.77,'AT':76.05,'PT':78.59,
  'NZ':78.27,'SK':75.19,'LV':72.76,'BE':72.99,'GB':72.54,'FR':72.44,'CZ':70.70,'GR':69.70,
  'CY':69.28,'US':66.59,'IT':66.78,'SL':62.51,'KR':65.03,'ES':62.86,'TW':62.44,'HR':66.31,
  'AM':59.58,'TT':62.90,'SG':57.00,'ZA':57.48,'GH':57.23,'SN':56.20,'NA':55.65,'ZM':55.34,
  'MK':54.98,'AR':54.71,'MX':54.69,'MU':54.10,'RS':52.97,'JP':52.11,'TZ':51.89,'KE':51.54,
  'BO':51.33,'MG':50.51,'ID':51.40,'CO':49.65,'UA':48.33,'AL':48.21,'HU':47.78,'GY':47.22,
  'MA':45.94,'TH':44.78,'ML':44.50,'BF':43.21,'GE':43.02,'MD':42.74,'LS':42.07,'UG':41.87,
  'BD':41.39,'MZ':40.54,'IN':40.18,'EC':39.87,'PE':39.40,'TG':39.22,'PH':38.88,'NG':46.89,
  'KE':51.54,'MM':50.01,'LB':30.10,'TR':29.51,'RW':29.64,'AF':28.54,'PK':27.89,'AZ':27.32,
  'KZ':26.78,'IR':20.06,'RU':19.67,'EG':18.73,'ET':17.82,'BY':17.08,'SD':16.94,'SA':15.50,
  'SY':14.35,'CN':13.45,'VN':12.99,'DZ':12.15,'LA':10.86,'CU':10.35,'TM':2.06,'ER':1.70,
  'KP':0.00,'NP':52.03,'LK':48.78,'CM':35.12,'CD':29.97,'KH':29.45,'IQ':27.12,'JO':26.43,
  'YE':18.24,'OM':22.15,'AE':17.84,'QA':29.40,'BH':19.76,'KW':30.52,'SS':17.44,'SO':18.90,
  'ZW':36.78,'BR':64.42,'CL':70.87,'UY':74.99,'PY':56.43,'EC':39.87,'GT':41.23,'HN':37.62,
  'SV':38.94,'NI':21.88,'DO':59.37,'JM':71.45,'CR':76.93,'PA':62.11,'CI':42.57,'GN':40.21,
  'BJ':53.24,'GW':52.10,'SN':56.20,'GH':57.23,'TZ':51.89,'MG':50.51,'MW':52.88,'ZM':55.34,
};

const PEACE_INDEX_DATA = {
  'IS':1.095,'IE':1.260,'NZ':1.282,'AT':1.294,'CH':1.294,'SG':1.357,'PT':1.371,'DK':1.393,
  'SI':1.409,'FI':1.420,'CZ':1.435,'JP':1.440,'CA':1.491,'NL':1.491,'BE':1.492,'HU':1.500,
  'AU':1.505,'NO':1.523,'SE':1.575,'DE':1.580,'LU':1.567,'PL':1.608,'ES':1.648,'SK':1.703,
  'IT':1.730,'UY':1.781,'TW':1.746,'RO':1.726,'BG':1.752,'CL':1.789,'KR':1.779,'HR':1.780,
  'AL':1.792,'LT':1.802,'LV':1.817,'EE':1.819,'GB':1.698,'GR':1.832,'MT':1.842,'CY':1.855,
  'FR':1.820,'OM':1.890,'MY':1.894,'VN':1.908,'GH':1.984,'MG':1.960,'NE':1.950,'SN':1.970,
  'MK':2.010,'MN':2.020,'KG':2.030,'CR':1.940,'PA':1.960,'MU':2.060,'RS':1.882,'TZ':2.000,
  'ZM':2.060,'AO':2.110,'LA':2.120,'KH':2.090,'BF':2.100,'KE':2.108,'BA':2.080,'ID':2.170,
  'BD':2.190,'MX':2.197,'BZ':2.210,'BO':2.210,'PY':2.220,'DO':2.230,'IN':2.290,'SB':2.306,
  'AR':2.350,'JM':2.360,'SV':2.369,'GT':2.374,'BR':2.284,'EC':2.257,'HN':2.270,'TH':2.395,
  'ZA':2.040,'TJ':2.260,'UZ':2.150,'KZ':2.160,'TM':2.170,'AZ':2.131,'ZW':2.500,'UG':2.390,
  'AM':2.380,'ET':2.500,'TR':2.609,'PH':2.340,'PK':2.618,'CM':2.620,'NG':2.600,'MM':2.944,
  'UA':3.440,'CD':3.002,'ML':2.876,'LY':3.073,'CF':3.270,'KP':2.930,'IR':2.837,'IQ':2.716,
  'SD':3.176,'SS':3.227,'AF':3.448,'SY':3.320,'YE':3.390,'RU':3.271,'SO':3.333,'HT':3.200,
  'CN':2.070,'US':2.440,'GE':2.238,'BY':2.810,'LB':3.189,'EG':2.357,'MA':1.930,'DZ':2.241,
  'TN':1.978,'DJ':2.410,'ER':2.580,'BJ':2.160,'CI':2.388,'GN':2.330,'LR':2.270,'SL':1.960,
  'SN':1.970,'MW':1.907,'MZ':2.290,'NA':1.890,'BW':1.870,'LS':1.978,'SZ':1.850,'RW':2.180,
};

const UNESCO_FALLBACK = {
  'IT':59,'CN':57,'DE':52,'FR':54,'ES':50,'IN':42,'MX':35,'GB':33,'RU':31,'JP':25,
  'US':24,'IR':27,'BR':23,'GR':19,'AU':20,'CA':22,'PT':17,'PL':17,'TR':21,'BE':16,
  'NL':13,'CZ':17,'PE':13,'AR':12,'SE':15,'KR':16,'SA':7,'EG':7,'ET':9,'ZA':10,
  'JO':6,'MA':9,'TN':8,'IL':9,'AT':12,'CH':13,'NO':8,'DK':10,'FI':7,'HU':8,
  'RO':9,'BG':10,'HR':10,'SK':7,'IE':2,'LT':4,'LV':2,'EE':2,'IS':2,'MT':3,
  'CY':3,'LU':1,'RS':5,'UA':8,'GE':4,'AM':3,'AZ':2,'KZ':5,'UZ':7,'TM':3,
  'KG':3,'MN':6,'KH':3,'VN':8,'TH':6,'MY':4,'ID':10,'PH':6,'LK':8,'NP':4,
  'BD':3,'PK':6,'AF':2,'IQ':6,'SY':6,'LB':5,'PS':4,'NG':2,'GH':2,'SN':7,
  'CD':5,'KE':7,'TZ':7,'UG':3,'MZ':1,'ZW':5,'ZM':1,'MG':3,'NA':2,'BW':2,
  'LY':5,'DZ':7,'SD':3,'ML':4,'CI':5,'CU':9,'GT':3,'CR':4,'PA':5,'CO':9,
  'VE':3,'EC':5,'BO':7,'CL':7,'NZ':3,'DO':1,'PG':1,'FJ':1,'MX':35,'TW':1,
  'CM':2,'MW':2,'BI':1,'RW':0,'SS':0,'SO':0,'ER':0,'DJ':0,'KP':2,'BY':0,
  'MD':1,'XK':1,'ME':4,'MK':2,'BA':2,'AL':4,'LB':5,'QA':1,'KW':0,'BH':3,
  'AE':1,'OM':5,'YE':4,'MM':2,'LA':3,'BN':0,'TL':1,'SB':1,'VU':1,'WS':0,
  'TO':0,'KI':1,'TV':0,'NR':0,'MH':0,'FM':0,'PW':0,'MU':2,'SC':2,'CV':1,
};

// Real-time data fetching functions
const fetchWorldBankData = async (indicator, year = '2022') => {
  try {
    const response = await fetch(
      `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=500&date=${year}:${year}`,
      { mode: 'cors' }
    );
    const data = await response.json();
    if (data && data[1]) {
      const result = {};
      data[1].forEach(entry => {
        if (entry.value !== null && entry.countryiso3code) {
          result[entry.countryiso3code] = entry.value;
        }
      });
      return result;
    }
  } catch (error) {
    console.warn(`Failed to fetch World Bank data for ${indicator}:`, error);
  }
  return {};
};

const fetchOWIDData = async (dataset) => {
  try {
    const response = await fetch(
      `https://raw.githubusercontent.com/owid/${dataset}/master/owid-${dataset}.csv`,
      { mode: 'cors' }
    );
    const csvText = await response.text();
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');

    const result = {};
    const currentYear = new Date().getFullYear();

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length >= 3) {
        const iso_code = values[0]?.replace(/"/g, '');
        const year = parseInt(values[2]);

        // Get most recent data (within last 5 years)
        if (iso_code && year >= currentYear - 5) {
          if (!result[iso_code] || year > result[iso_code].year) {
            result[iso_code] = { year, data: values };
          }
        }
      }
    }
    return result;
  } catch (error) {
    console.warn(`Failed to fetch OWID data for ${dataset}:`, error);
  }
  return {};
};

const fetchUNESCO = async () => {
  try {
    const r = await fetch('https://whc.unesco.org/en/list/?output=json&limit=2000', { mode: 'cors' });
    const sites = await r.json();
    const counts = {};
    sites.forEach(site => {
      (site.iso_code || '').split(',').forEach(c => {
        const k = c.trim().toUpperCase();
        if (k) counts[k] = (counts[k] || 0) + 1;
      });
    });
    return counts;
  } catch (e) {
    console.warn('UNESCO API failed, using fallback data');
    return null;
  }
};

const fetchRestCountries = async () => {
  try {
    const response = await fetch('https://restcountries.com/v3.1/all?fields=cca2,area,borders,languages,timezones,landlocked,unMember', { mode: 'cors' });
    const countries = await response.json();
    const result = {};

    countries.forEach(country => {
      if (country.cca2) {
        result[country.cca2] = {
          area: country.area || 0,
          neighbors: country.borders ? country.borders.length : 0,
          languages: country.languages ? Object.keys(country.languages).length : 0,
          timezones: country.timezones ? country.timezones.length : 0,
          landlocked: country.landlocked ? 1 : 0,
          unMember: country.unMember ? 1 : 0,
        };
      }
    });
    return result;
  } catch (error) {
    console.warn('Failed to fetch REST Countries data:', error);
  }
  return {};
};

// Global data cache
let globalDataCache = {
  worldBank: {},
  owid: {},
  restCountries: {},
  unesco: {},
  lastFetch: 0
};

// Initialize data fetching
const initializeGlobalData = async () => {
  const now = Date.now();
  // Cache for 1 hour
  if (now - globalDataCache.lastFetch < 3600000 && Object.keys(globalDataCache.worldBank).length > 0) {
    return globalDataCache;
  }

  console.log('Fetching global datasets...');

  // Fetch World Bank indicators
  const wbIndicators = {
    'AG.LND.FRST.ZS': 'forest_area_pct',
    'EN.ATM.CO2E.PC': 'co2_emissions_per_capita',
    'SP.URB.TOTL.IN.ZS': 'urban_population_pct',
    'IT.NET.USER.ZS': 'internet_users_pct',
    'SE.XPD.TOTL.GD.ZS': 'education_expenditure_pct',
    'EG.ELC.RNEW.ZS': 'renewable_electricity_pct',
    'SP.DYN.LE00.IN': 'life_expectancy',
    'NY.GDP.MKTP.KD.ZG': 'gdp_growth_rate',
    'SL.UEM.TOTL.ZS': 'unemployment_rate',
    'NE.EXP.GNFS.ZS': 'exports_pct_gdp',
    'MS.MIL.XPND.GD.ZS': 'military_expenditure_pct',
    'FP.CPI.TOTL.ZG': 'inflation_rate',
    'SP.DYN.TFRT.IN': 'fertility_rate',
    'SP.DYN.IMRT.IN': 'infant_mortality',
    'SI.POV.GINI': 'gini_coefficient',
    'EG.ELC.ACCS.ZS': 'electricity_access',
    'SH.H2O.BASW.ZS': 'clean_water_access',
  };

  // Fetch World Bank data
  for (const [indicator, name] of Object.entries(wbIndicators)) {
    try {
      const data = await fetchWorldBankData(indicator);
      globalDataCache.worldBank[name] = data;
      console.log(`✓ Fetched ${name}: ${Object.keys(data).length} countries`);
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.warn(`Failed to fetch ${name}:`, error);
    }
  }

  // Fetch REST Countries data
  try {
    globalDataCache.restCountries = await fetchRestCountries();
    console.log(`✓ Fetched country data: ${Object.keys(globalDataCache.restCountries).length} countries`);
  } catch (error) {
    console.warn('Failed to fetch REST Countries:', error);
  }

  // Fetch UNESCO World Heritage Sites
  try {
    const unescoData = await fetchUNESCO();
    globalDataCache.unesco = unescoData || UNESCO_FALLBACK;
    console.log(`✓ UNESCO data: ${Object.keys(globalDataCache.unesco).length} countries`);
  } catch (error) {
    globalDataCache.unesco = UNESCO_FALLBACK;
    console.warn('UNESCO fetch error, using fallback');
  }

  globalDataCache.lastFetch = now;
  console.log('Global data initialization complete');
  return globalDataCache;
};

// Comprehensive country data for accurate calculations
const COUNTRY_DATA = {
  // Area in km² and land border count - will be supplemented by REST Countries API
  'RU': { area: 17098242, neighbors: 16 }, 'CA': { area: 9984670, neighbors: 1 }, 'US': { area: 9833517, neighbors: 2 },
  'CN': { area: 9596960, neighbors: 14 }, 'BR': { area: 8514877, neighbors: 10 }, 'AU': { area: 7692024, neighbors: 0 },
  'IN': { area: 3287263, neighbors: 6 }, 'AR': { area: 2780400, neighbors: 5 }, 'KZ': { area: 2724900, neighbors: 5 },
  'DZ': { area: 2381741, neighbors: 7 }, 'CD': { area: 2344858, neighbors: 9 }, 'SA': { area: 2149690, neighbors: 7 },
  'MX': { area: 1964375, neighbors: 3 }, 'ID': { area: 1904569, neighbors: 3 }, 'SD': { area: 1861484, neighbors: 7 },
  'LY': { area: 1759540, neighbors: 6 }, 'IR': { area: 1648195, neighbors: 7 }, 'MN': { area: 1564110, neighbors: 2 },
  'PE': { area: 1285216, neighbors: 5 }, 'TD': { area: 1284000, neighbors: 6 }, 'NE': { area: 1267000, neighbors: 7 },
  'AO': { area: 1246700, neighbors: 4 }, 'ML': { area: 1240192, neighbors: 7 }, 'ZA': { area: 1221037, neighbors: 6 },
  'CO': { area: 1141748, neighbors: 5 }, 'ET': { area: 1104300, neighbors: 6 }, 'BO': { area: 1098581, neighbors: 5 },
  'MR': { area: 1030700, neighbors: 4 }, 'EG': { area: 1001449, neighbors: 4 }, 'TZ': { area: 947300, neighbors: 8 },
  'NG': { area: 923768, neighbors: 4 }, 'VE': { area: 912050, neighbors: 3 }, 'PK': { area: 881913, neighbors: 4 },
  'MZ': { area: 801590, neighbors: 6 }, 'TR': { area: 783562, neighbors: 8 }, 'CL': { area: 756096, neighbors: 3 },
  'ZM': { area: 752618, neighbors: 8 }, 'MM': { area: 676578, neighbors: 5 }, 'AF': { area: 652230, neighbors: 6 },
  'SO': { area: 637657, neighbors: 3 }, 'CF': { area: 622984, neighbors: 6 }, 'UA': { area: 603550, neighbors: 7 },
  'MG': { area: 587041, neighbors: 0 }, 'BW': { area: 581730, neighbors: 4 }, 'KE': { area: 580367, neighbors: 5 },
  'FR': { area: 551695, neighbors: 11 }, 'YE': { area: 527968, neighbors: 2 }, 'TH': { area: 513120, neighbors: 4 },
  'ES': { area: 505992, neighbors: 5 }, 'TM': { area: 488100, neighbors: 4 }, 'CM': { area: 475442, neighbors: 6 },
  'PG': { area: 462840, neighbors: 1 }, 'UZ': { area: 447400, neighbors: 5 }, 'MA': { area: 446550, neighbors: 3 },
  'IQ': { area: 438317, neighbors: 6 }, 'PY': { area: 406752, neighbors: 3 }, 'ZW': { area: 390757, neighbors: 4 },
  'JP': { area: 377930, neighbors: 0 }, 'DE': { area: 357114, neighbors: 9 }, 'CG': { area: 342000, neighbors: 6 },
  'FI': { area: 338424, neighbors: 3 }, 'VN': { area: 331212, neighbors: 3 }, 'MY': { area: 330803, neighbors: 3 },
  'NO': { area: 323802, neighbors: 3 }, 'CI': { area: 322463, neighbors: 5 }, 'PL': { area: 312696, neighbors: 7 },
  'OM': { area: 309500, neighbors: 3 }, 'IT': { area: 301336, neighbors: 6 }, 'PH': { area: 300000, neighbors: 0 },
  'EC': { area: 283561, neighbors: 2 }, 'BF': { area: 274222, neighbors: 6 }, 'NZ': { area: 268838, neighbors: 0 },
  'GA': { area: 267668, neighbors: 3 }, 'GN': { area: 245857, neighbors: 6 }, 'GB': { area: 242495, neighbors: 1 },
  'UG': { area: 241550, neighbors: 5 }, 'GH': { area: 238533, neighbors: 3 }, 'RO': { area: 238391, neighbors: 5 },
  'LA': { area: 236800, neighbors: 5 }, 'GY': { area: 214969, neighbors: 3 }, 'BY': { area: 207600, neighbors: 5 },
  'KG': { area: 199951, neighbors: 4 }, 'SN': { area: 196722, neighbors: 5 }, 'SY': { area: 185180, neighbors: 5 },
  'KH': { area: 181035, neighbors: 3 }, 'UY': { area: 176215, neighbors: 2 }, 'TN': { area: 163610, neighbors: 2 },
  'SR': { area: 163820, neighbors: 3 }, 'BD': { area: 148460, neighbors: 2 }, 'NP': { area: 147181, neighbors: 2 },
  'TJ': { area: 143100, neighbors: 4 }, 'GR': { area: 131957, neighbors: 4 }, 'NI': { area: 130373, neighbors: 2 },
  'KP': { area: 120538, neighbors: 3 }, 'ER': { area: 117600, neighbors: 3 }, 'BG': { area: 110879, neighbors: 5 },
  'CU': { area: 109884, neighbors: 1 }, 'IS': { area: 103000, neighbors: 0 }, 'KR': { area: 100210, neighbors: 1 },
  'HU': { area: 93028, neighbors: 7 }, 'PT': { area: 92090, neighbors: 1 }, 'JO': { area: 89342, neighbors: 5 },
  'AZ': { area: 86600, neighbors: 5 }, 'AT': { area: 83879, neighbors: 8 }, 'AE': { area: 83600, neighbors: 2 },
  'CZ': { area: 78867, neighbors: 4 }, 'RS': { area: 77474, neighbors: 8 }, 'PA': { area: 75417, neighbors: 2 },
  'SI': { area: 20273, neighbors: 4 }, 'LT': { area: 65300, neighbors: 4 }, 'LV': { area: 64559, neighbors: 4 },
  'TG': { area: 56785, neighbors: 3 }, 'HR': { area: 56594, neighbors: 5 }, 'BA': { area: 51197, neighbors: 3 },
  'CR': { area: 51100, neighbors: 2 }, 'SK': { area: 49035, neighbors: 5 }, 'EE': { area: 45228, neighbors: 2 },
  'DK': { area: 43094, neighbors: 1 }, 'CH': { area: 41285, neighbors: 5 }, 'NL': { area: 41850, neighbors: 2 },
  'BT': { area: 38394, neighbors: 2 }, 'MD': { area: 33846, neighbors: 2 }, 'BE': { area: 30528, neighbors: 4 },
  'AM': { area: 29743, neighbors: 4 }, 'AL': { area: 28748, neighbors: 4 }, 'MK': { area: 25713, neighbors: 5 },
  'SL': { area: 71740, neighbors: 2 }, 'IE': { area: 70273, neighbors: 1 }, 'GE': { area: 69700, neighbors: 4 },
  'LR': { area: 111369, neighbors: 3 }, 'LB': { area: 10452, neighbors: 2 }, 'JM': { area: 10991, neighbors: 0 },
  'QA': { area: 11586, neighbors: 1 }, 'VU': { area: 12189, neighbors: 0 }, 'ME': { area: 13812, neighbors: 5 },
  'BH': { area: 760, neighbors: 1 }, 'GM': { area: 11295, neighbors: 1 }, 'KW': { area: 17818, neighbors: 2 },
  'FJ': { area: 18272, neighbors: 0 }, 'SZ': { area: 17364, neighbors: 2 }, 'IL': { area: 20770, neighbors: 4 },
  'SV': { area: 21041, neighbors: 2 }, 'BZ': { area: 22966, neighbors: 2 }, 'DJ': { area: 23200, neighbors: 3 },
  'RW': { area: 26338, neighbors: 4 }, 'HT': { area: 27750, neighbors: 1 }, 'BI': { area: 27834, neighbors: 3 },
  'GW': { area: 36125, neighbors: 2 }, 'MW': { area: 118484, neighbors: 3 }, 'LS': { area: 30355, neighbors: 1 },
  'GQ': { area: 28051, neighbors: 2 }, 'LU': { area: 2586, neighbors: 3 }, 'CY': { area: 9251, neighbors: 0 },
  'MU': { area: 2040, neighbors: 0 }, 'KM': { area: 1862, neighbors: 0 }, 'CV': { area: 4033, neighbors: 0 },
  'WS': { area: 2842, neighbors: 0 }, 'LK': { area: 65610, neighbors: 0 }, 'AD': { area: 468, neighbors: 2 },
  'AG': { area: 442, neighbors: 0 }, 'BB': { area: 430, neighbors: 0 }, 'TO': { area: 747, neighbors: 0 },
  'DM': { area: 751, neighbors: 0 }, 'PW': { area: 459, neighbors: 0 }, 'ST': { area: 964, neighbors: 0 },
  'KI': { area: 811, neighbors: 0 }, 'MH': { area: 181, neighbors: 0 }, 'LC': { area: 616, neighbors: 0 },
  'FM': { area: 702, neighbors: 0 }, 'SG': { area: 719, neighbors: 1 }, 'VC': { area: 389, neighbors: 0 },
  'GD': { area: 344, neighbors: 0 }, 'MT': { area: 316, neighbors: 0 }, 'MV': { area: 298, neighbors: 0 },
  'KN': { area: 261, neighbors: 0 }, 'NR': { area: 21, neighbors: 0 }, 'TV': { area: 26, neighbors: 0 },
  'SM': { area: 61, neighbors: 1 }, 'LI': { area: 160, neighbors: 2 }, 'MC': { area: 2, neighbors: 1 },
  'VA': { area: 0.17, neighbors: 1 }
};

// Available datasets with metadata - organized by strategic relevance
const AVAILABLE_DATASETS = {
  // ── CORE ──────────────────────────────────────────────────────────────────
  gdp: {
    id: 'gdp',
    name: 'GDP (Billions USD)',
    category: 'Core',
    getter: (feat) => feat.properties.GDP_MD_EST || feat.properties.GDP_MD || 0,
    unit: 'B$',
    format: (val) => `${Math.round(val / 1000)}B$`
  },
  population: {
    id: 'population',
    name: 'Population',
    category: 'Core',
    getter: (feat) => feat.properties.POP_EST || feat.properties.POP2005 || 0,
    unit: 'M',
    format: (val) => `${Math.round(val / 1000000)}M`
  },
  area: {
    id: 'area',
    name: 'Area (km²)',
    category: 'Core',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const restData = globalDataCache.restCountries[code];
      return restData?.area || COUNTRY_DATA[code]?.area || feat.properties.AREA || feat.properties.AREA_KM2 || 0;
    },
    unit: 'K km²',
    format: (val) => `${Math.round(val / 1000)}K km²`
  },
  neighbors: {
    id: 'neighbors',
    name: 'Neighbors',
    category: 'Core',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const restData = globalDataCache.restCountries[code];
      return restData?.neighbors || COUNTRY_DATA[code]?.neighbors || feat.properties.NEIGHBORS || feat.properties.NEIGHBOR_COUNT || 0;
    },
    unit: '',
    format: (val) => `${val}`
  },

  // ── MILITARY ──────────────────────────────────────────────────────────────
  military_expenditure: {
    id: 'military_expenditure',
    name: 'Military Expenditure (% GDP)',
    category: 'Military',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const militaryData = {
        'OM': 8.8, 'SA': 8.0, 'AZ': 5.0, 'KW': 5.6, 'JO': 4.8, 'AM': 4.9, 'SG': 3.2, 'RU': 4.3,
        'US': 3.5, 'IL': 5.6, 'KR': 2.8, 'GR': 3.8, 'EE': 2.3, 'LV': 2.3, 'PL': 2.4, 'GB': 2.3,
        'FR': 2.0, 'NO': 2.0, 'AU': 2.1, 'FI': 1.5, 'NL': 1.4, 'DE': 1.6, 'DK': 1.4, 'IT': 1.5,
        'CA': 1.4, 'SE': 1.2, 'BE': 1.1, 'ES': 1.0, 'PT': 1.5, 'CZ': 1.4, 'SK': 2.0, 'SI': 1.0,
        'HU': 1.8, 'HR': 1.8, 'LT': 2.5, 'RO': 2.5, 'BG': 3.2, 'AL': 1.2, 'ME': 1.6, 'MK': 1.2,
        'BA': 0.9, 'RS': 2.2, 'UA': 3.8, 'BY': 1.2, 'MD': 0.4, 'TR': 2.8, 'GE': 2.0, 'KZ': 1.1,
        'UZ': 4.0, 'TM': 1.9, 'KG': 1.7, 'TJ': 1.2, 'MN': 0.7, 'CN': 1.7, 'IN': 2.9, 'PK': 4.0,
        'BD': 1.4, 'LK': 2.0, 'NP': 1.6, 'BT': 1.0, 'MM': 2.9, 'TH': 1.4, 'VN': 2.3, 'KH': 2.2,
        'LA': 0.2, 'MY': 1.0, 'ID': 0.8, 'PH': 1.0, 'BN': 2.8, 'JP': 1.0,
        'TW': 2.1, 'AF': 1.2, 'IR': 2.0, 'IQ': 3.5, 'SY': 2.9, 'LB': 4.5, 'PS': 0.0, 'YE': 3.9,
        'QA': 1.5, 'BH': 3.7, 'AE': 5.7, 'EG': 1.2, 'LY': 0.0, 'TN': 2.6, 'DZ': 6.0, 'MA': 3.4,
        'SD': 2.5, 'SS': 2.8, 'ER': 0.8, 'ET': 0.7, 'DJ': 3.5, 'SO': 0.0, 'KE': 1.3, 'UG': 2.1,
        'RW': 1.3, 'BI': 2.0, 'TZ': 1.1, 'MW': 0.8, 'ZM': 1.2, 'ZW': 0.7, 'MZ': 1.0, 'MG': 0.6,
        'MU': 0.2, 'SC': 1.3, 'KM': 0.0, 'BW': 3.0, 'NA': 3.4, 'ZA': 1.1, 'LS': 1.8, 'SZ': 1.8,
        'AO': 1.7, 'CD': 0.7, 'CF': 1.4, 'CG': 2.7, 'CM': 1.1, 'GQ': 1.1, 'GA': 1.6, 'ST': 0.5,
        'TD': 2.9, 'NG': 0.6, 'NE': 1.8, 'BF': 2.4, 'ML': 2.7, 'SN': 1.5, 'MR': 2.8, 'GM': 0.8,
        'GW': 1.7, 'GN': 2.6, 'SL': 0.8, 'LR': 0.5, 'CI': 1.1, 'GH': 0.4, 'TG': 1.8, 'BJ': 0.7,
        'CV': 0.5, 'BR': 1.4, 'AR': 0.9, 'CL': 1.9, 'UY': 2.0, 'PY': 1.0, 'BO': 1.4, 'PE': 1.2,
        'EC': 2.4, 'CO': 3.1, 'VE': 0.4, 'GY': 1.4, 'SR': 1.5, 'MX': 0.7, 'GT': 0.4, 'BZ': 1.2,
        'SV': 1.2, 'HN': 1.6, 'NI': 0.6, 'CR': 0.0, 'PA': 0.0, 'CU': 2.9, 'JM': 1.6, 'HT': 0.0,
        'DO': 0.7, 'TT': 0.7, 'BB': 0.8, 'LC': 0.0, 'VC': 0.0, 'GD': 0.0, 'AG': 0.0, 'KN': 0.0,
        'DM': 0.0, 'FJ': 1.6, 'VU': 0.0, 'SB': 0.0, 'PG': 0.4, 'WS': 0.0, 'TO': 0.0, 'KI': 0.0,
        'TV': 0.0, 'NR': 0.0, 'MH': 0.0, 'FM': 0.0, 'PW': 0.0
      };
      return militaryData[code] || 1.5;
    },
    unit: '% GDP',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },

  // ── ECONOMY ───────────────────────────────────────────────────────────────
  gdp_per_capita: {
    id: 'gdp_per_capita',
    name: 'GDP per Capita (USD)',
    category: 'Economy',
    getter: (feat) => {
      const gdp = feat.properties.GDP_MD_EST || 0;
      const pop = feat.properties.POP_EST || 1;
      return (gdp * 1000000) / pop;
    },
    unit: 'USD',
    format: (val) => `$${Math.round(val).toLocaleString()}`
  },
  gdp_growth: {
    id: 'gdp_growth',
    name: 'GDP Growth Rate (%)',
    category: 'Economy',
    getter: (feat) => {
      const iso2 = getCountryCode(feat);
      const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3;
      return globalDataCache.worldBank.gdp_growth_rate?.[iso3] || 0;
    },
    unit: '%',
    format: (val) => `${Math.round(val * 100) / 100}%`
  },
  exports_gdp: {
    id: 'exports_gdp',
    name: 'Exports (% GDP)',
    category: 'Economy',
    getter: (feat) => {
      const iso2 = getCountryCode(feat);
      const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3;
      return globalDataCache.worldBank.exports_pct_gdp?.[iso3] || 0;
    },
    unit: '% GDP',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },
  economic_complexity: {
    id: 'economic_complexity',
    name: 'Economic Complexity Index',
    category: 'Economy',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const eciData = {
        'JP': 2.28, 'CH': 2.09, 'DE': 1.96, 'KR': 1.78, 'AT': 1.54, 'FI': 1.49, 'CZ': 1.46,
        'SE': 1.34, 'HU': 1.33, 'SG': 1.24, 'IT': 1.23, 'SI': 1.18, 'SK': 1.10, 'IE': 1.07,
        'FR': 1.06, 'BE': 0.98, 'PL': 0.97, 'US': 0.95, 'GB': 0.93, 'ES': 0.78, 'IL': 0.77,
        'NL': 0.75, 'PT': 0.65, 'EE': 0.64, 'LT': 0.58, 'LV': 0.45, 'HR': 0.42, 'RO': 0.33,
        'BG': 0.28, 'GR': 0.21, 'TR': 0.15, 'MX': 0.12, 'CN': 0.11, 'TH': 0.09, 'MY': 0.08,
        'BR': -0.15, 'IN': -0.3, 'RU': -0.35, 'ZA': -0.4, 'AR': -0.45, 'CL': -0.5, 'ID': -0.55,
        'PH': -0.6, 'VN': -0.65, 'EG': -0.7, 'MA': -0.75, 'PE': -0.8, 'CO': -0.85, 'EC': -0.9,
        'NG': -1.2, 'KE': -1.3, 'GH': -1.4, 'ET': -1.5, 'UG': -1.6, 'TZ': -1.7, 'ZM': -1.8
      };
      return eciData[code] || 0;
    },
    unit: 'index',
    format: (val) => `${Math.round(val * 100) / 100}`
  },
  unemployment: {
    id: 'unemployment',
    name: 'Unemployment Rate (%)',
    category: 'Economy',
    getter: (feat) => {
      const iso2 = getCountryCode(feat);
      const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3;
      return globalDataCache.worldBank.unemployment_rate?.[iso3] || 0;
    },
    unit: '%',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },
  inflation_rate: {
    id: 'inflation_rate', name: 'Inflation Rate (%)', category: 'Economy',
    getter: (feat) => { const iso2 = getCountryCode(feat); const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3; return globalDataCache.worldBank.inflation_rate?.[iso3] || 0; },
    unit: '%', format: (val) => `${Math.round(val * 10) / 10}%`
  },
  gini_coefficient: {
    id: 'gini_coefficient', name: 'Gini Coefficient', category: 'Economy',
    getter: (feat) => { const iso2 = getCountryCode(feat); const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3; return globalDataCache.worldBank.gini_coefficient?.[iso3] || 0; },
    unit: 'index', format: (val) => `${Math.round(val * 10) / 10}`
  },

  // ── RESOURCES ─────────────────────────────────────────────────────────────
  oil_production: {
    id: 'oil_production',
    name: 'Oil Production (barrels/day)',
    category: 'Resources',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const oilProducers = { 'US': 12000, 'RU': 11000, 'SA': 10000, 'CA': 5500, 'IQ': 4500, 'CN': 4000, 'AE': 3500, 'BR': 3000, 'KW': 2700, 'IR': 2500, 'NO': 2000, 'MX': 1800, 'KZ': 1800, 'NG': 1700, 'QA': 1500 };
      if (oilProducers[code]) return oilProducers[code] * 1000;
      return null;
    },
    unit: 'bbl/day',
    format: (val) => val > 1000000 ? `${Math.round(val / 1000000)}M bbl/day` : `${Math.round(val / 1000)}K bbl/day`
  },
  energy_security: {
    id: 'energy_security',
    name: 'Energy Security Index',
    category: 'Resources',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const energyData = {
        'NO': 95, 'SA': 92, 'RU': 90, 'CA': 88, 'AU': 85, 'US': 82, 'AE': 80, 'KW': 78,
        'QA': 76, 'BH': 74, 'OM': 72, 'KZ': 70, 'IR': 68, 'VE': 66, 'NG': 64, 'AO': 62,
        'DZ': 60, 'LY': 58, 'EG': 56, 'MX': 54, 'BR': 52, 'MY': 50, 'ID': 48, 'CN': 46,
        'IN': 44, 'GB': 42, 'NL': 40, 'FR': 38, 'DE': 36, 'IT': 34, 'ES': 32, 'PL': 30,
        'TR': 28, 'TH': 26, 'VN': 24, 'PH': 22, 'BD': 20, 'PK': 18, 'LK': 16, 'JP': 14,
        'KR': 12, 'SG': 10, 'HK': 8, 'TW': 6, 'BE': 4, 'LU': 2
      };
      return energyData[code] || 25;
    },
    unit: 'index',
    format: (val) => `${Math.round(val)}`
  },
  energy_consumption: {
    id: 'energy_consumption',
    name: 'Energy Consumption (TWh)',
    category: 'Resources',
    getter: (feat) => {
      const gdp = feat.properties.GDP_MD_EST || 0;
      const pop = feat.properties.POP_EST || 1;
      const code = getCountryCode(feat);
      const baseConsumption = (gdp / 100) + (pop / 10000000);
      const industrialMultiplier = ['CN', 'US', 'IN', 'RU', 'JP', 'DE', 'KR', 'CA', 'BR', 'IR'].includes(code) ? 2 : 1;
      return Math.max(10, baseConsumption * industrialMultiplier);
    },
    unit: 'TWh',
    format: (val) => `${Math.round(val)} TWh`
  },
  gold_production: {
    id: 'gold_production',
    name: 'Gold Production (tonnes)',
    category: 'Resources',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const goldProducers = { 'CN': 380, 'AU': 330, 'RU': 300, 'US': 200, 'CA': 180, 'PE': 140, 'GH': 130, 'ZA': 120, 'MX': 110, 'UZ': 100 };
      if (goldProducers[code]) return goldProducers[code];
      return null;
    },
    unit: 'tonnes',
    format: (val) => `${Math.round(val)} tonnes`
  },
  copper_reserves: {
    id: 'copper_reserves',
    name: 'Copper Reserves (Mt)',
    category: 'Resources',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const copperReserves = {
        'CL': 200, 'AU': 88, 'PE': 87, 'RU': 61, 'US': 51, 'MX': 53, 'CN': 26, 'ID': 28, 'PL': 40, 'ZM': 20,
        'KZ': 19, 'CA': 11, 'IR': 9.3, 'TR': 6.1, 'MN': 1.4, 'AR': 3.2, 'BO': 5.6, 'BR': 6.8, 'BG': 2.9,
        'CD': 20, 'PH': 4.8, 'PT': 1.6, 'RS': 5.5, 'ES': 0.6, 'UZ': 1.8, 'ZW': 0.3
      };
      return copperReserves[code] || 0;
    },
    unit: 'Mt',
    format: (val) => `${Math.round(val)} Mt`
  },

  // ── POPULATION ────────────────────────────────────────────────────────────
  population_density: {
    id: 'population_density',
    name: 'Population Density (/km²)',
    category: 'Population',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const pop = feat.properties.POP_EST || 0;
      const area = COUNTRY_DATA[code]?.area || feat.properties.AREA || 1;
      return pop / area;
    },
    unit: '/km²',
    format: (val) => `${Math.round(val)}/km²`
  },
  urban_population: {
    id: 'urban_population',
    name: 'Urban Population (%)',
    category: 'Population',
    getter: (feat) => {
      const iso2 = getCountryCode(feat);
      const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3;
      return globalDataCache.worldBank.urban_population_pct?.[iso3] || 0;
    },
    unit: '%',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },
  urbanization: {
    id: 'urbanization',
    name: 'Urban Population — hardcoded (%)',
    category: 'Population',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const urbanData = {
        'SG': 100, 'KW': 100, 'MC': 100, 'NR': 100, 'VA': 100, 'QA': 99.2, 'BH': 89.4, 'MT': 94.9,
        'IS': 94.1, 'IL': 92.6, 'UY': 95.5, 'AR': 92.1, 'AU': 86.2, 'BE': 98.1, 'DK': 88.1,
        'FI': 85.5, 'FR': 81.0, 'DE': 77.5, 'JP': 91.8, 'LU': 91.5, 'NL': 92.2, 'NO': 83.2,
        'SE': 88.0, 'GB': 84.2, 'US': 82.7, 'CA': 81.6, 'KR': 81.4, 'ES': 81.0, 'IT': 71.0,
        'NZ': 86.7, 'CH': 74.0, 'AT': 59.0, 'CZ': 74.1, 'EE': 69.2, 'GR': 79.7, 'HU': 72.2,
        'LV': 68.3, 'LT': 68.0, 'PL': 60.1, 'PT': 66.3, 'SK': 53.8, 'SI': 55.0, 'HR': 57.6,
        'IE': 63.7, 'CY': 66.8, 'RU': 75.0, 'BY': 79.5, 'UA': 69.6, 'MD': 42.8, 'RO': 54.0,
        'BG': 75.7, 'AL': 62.1, 'BA': 49.2, 'ME': 67.8, 'MK': 58.5, 'RS': 56.4, 'XK': 38.8,
        'TR': 76.0, 'AM': 63.3, 'AZ': 56.4, 'GE': 59.5, 'KZ': 57.7, 'KG': 36.6, 'TJ': 27.5,
        'TM': 52.0, 'UZ': 50.5, 'MN': 68.5, 'CN': 63.0, 'KP': 62.1, 'TW': 78.9, 'HK': 100,
        'MO': 100, 'IN': 35.0, 'BD': 38.2, 'BT': 42.3, 'LK': 18.7, 'MV': 40.7, 'NP': 20.6,
        'PK': 37.2, 'AF': 25.5, 'IR': 75.4, 'IQ': 70.9, 'SY': 55.5, 'JO': 91.4, 'LB': 88.8,
        'PS': 76.7, 'YE': 37.3, 'OM': 86.6, 'SA': 84.3, 'AE': 87.0, 'TH': 51.4, 'VN': 37.3,
        'KH': 24.2, 'LA': 36.3, 'MM': 31.1, 'MY': 77.2, 'PH': 47.4, 'ID': 56.6, 'BN': 78.3,
        'TL': 31.0, 'PG': 13.2, 'SB': 25.1, 'VU': 25.5, 'FJ': 57.2, 'NC': 70.7, 'PF': 56.0,
        'WS': 18.0, 'TO': 23.1, 'KI': 55.6, 'TV': 64.0, 'MH': 77.8, 'FM': 22.9,
        'PW': 81.4, 'BR': 87.1, 'CL': 87.7, 'CO': 81.4, 'EC': 64.2, 'GY': 26.8, 'PY': 62.2,
        'PE': 78.1, 'SR': 66.1, 'VE': 88.2, 'BO': 69.8, 'MX': 80.7, 'GT': 51.8,
        'BZ': 46.0, 'SV': 73.4, 'HN': 57.9, 'NI': 59.0, 'CR': 80.8, 'PA': 68.4, 'CU': 77.2,
        'JM': 56.3, 'HT': 57.1, 'DO': 82.5, 'TT': 53.2, 'BB': 31.2, 'LC': 18.9, 'VC': 53.2,
        'GD': 36.5, 'AG': 24.4, 'KN': 30.8, 'DM': 71.1, 'EG': 42.8, 'LY': 80.7, 'TN': 69.3,
        'DZ': 73.7, 'MA': 63.5, 'SD': 35.3, 'SS': 20.2, 'ER': 42.6, 'ET': 21.7, 'DJ': 78.1,
        'SO': 46.7, 'KE': 28.0, 'UG': 25.5, 'RW': 17.4, 'BI': 13.4, 'TZ': 35.2, 'MW': 17.2,
        'ZM': 45.2, 'ZW': 32.2, 'MZ': 36.5, 'MG': 38.5, 'MU': 40.8, 'SC': 58.1, 'KM': 29.4,
        'BW': 70.9, 'NA': 51.0, 'ZA': 67.4, 'LS': 29.0, 'SZ': 24.2, 'AO': 66.8, 'CD': 45.6,
        'CF': 42.2, 'CG': 67.8, 'CM': 57.6, 'GQ': 73.1, 'GA': 90.1, 'ST': 74.4, 'TD': 23.5,
        'NG': 52.0, 'NE': 16.6, 'BF': 31.2, 'ML': 43.9, 'SN': 48.1, 'MR': 55.3, 'GM': 62.6,
        'GW': 44.2, 'GN': 36.9, 'SL': 43.0, 'LR': 52.6, 'CI': 51.7, 'GH': 57.3, 'TG': 42.8,
        'BJ': 48.4, 'CV': 66.7
      };
      return urbanData[code] || 50.0;
    },
    unit: '%',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },
  fertility_rate: {
    id: 'fertility_rate', name: 'Fertility Rate (births/woman)', category: 'Population',
    getter: (feat) => { const iso2 = getCountryCode(feat); const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3; return globalDataCache.worldBank.fertility_rate?.[iso3] || 0; },
    unit: 'births/woman', format: (val) => `${Math.round(val * 100) / 100}`
  },
  infant_mortality: {
    id: 'infant_mortality', name: 'Infant Mortality (per 1000)', category: 'Population',
    getter: (feat) => { const iso2 = getCountryCode(feat); const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3; return globalDataCache.worldBank.infant_mortality?.[iso3] || 0; },
    unit: 'per 1000', format: (val) => `${Math.round(val * 10) / 10}`
  },

  // ── INFRASTRUCTURE ────────────────────────────────────────────────────────
  road_density: {
    id: 'road_density',
    name: 'Road Density (km/100km²)',
    category: 'Infrastructure',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const roadData = {
        'MC': 4167, 'BE': 505, 'SG': 489, 'BD': 373, 'BB': 370, 'BH': 364, 'MT': 316, 'NL': 332,
        'JP': 324, 'DE': 180, 'IL': 190, 'GB': 167, 'IT': 173, 'CH': 171, 'LU': 135, 'FR': 137,
        'AT': 134, 'CZ': 130, 'HU': 122, 'LK': 154, 'SI': 103, 'IE': 96, 'MU': 98, 'KR': 106,
        'LB': 106, 'AE': 113, 'BI': 113, 'RW': 105, 'SK': 87, 'PL': 84, 'LT': 84, 'MY': 81,
        'QA': 78, 'HR': 75, 'DK': 74, 'PT': 73, 'JO': 73, 'ES': 67, 'US': 67, 'SY': 69,
        'GR': 32, 'VN': 58, 'LV': 57, 'ZA': 54, 'KW': 53, 'CN': 53, 'TH': 36, 'EC': 35,
        'EE': 34, 'PK': 34, 'PH': 32, 'UY': 32, 'MZ': 31, 'IR': 27, 'SG': 489, 'ID': 26,
        'FI': 26, 'SC': 26, 'SR': 25, 'SE': 25, 'ZM': 22, 'UG': 20, 'BR': 20, 'NG': 20,
        'ZW': 19, 'TN': 19, 'NP': 17, 'CG': 17, 'MX': 17, 'LK': 154, 'LS': 18, 'KE': 18,
        'IS': 13, 'CA': 11, 'CO': 11, 'SZ': 29, 'TR': 49, 'IN': 142, 'NO': 9, 'TZ': 9,
        'GA': 9, 'IQ': 8, 'YE': 8, 'EG': 8, 'KH': 8, 'BT': 8, 'CL': 8, 'PE': 8, 'GH': 109,
        'GQ': 8, 'AO': 8, 'SA': 4, 'LA': 14, 'MM': 5, 'AF': 4, 'MN': 4, 'GY': 4, 'CF': 1,
        'TD': 1, 'CM': 4, 'SD': 4, 'ET': 4, 'LY': 2, 'DZ': 5, 'MA': 10, 'OM': 10, 'BO': 6,
        'PY': 6, 'AR': 5, 'VE': 10, 'NA': 6, 'BW': 5, 'MG': 2, 'KM': 76, 'GN': 4, 'GW': 4,
        'SN': 5, 'GM': 37, 'ML': 5, 'BF': 5, 'NE': 4, 'MR': 3, 'TG': 7, 'BJ': 7, 'CI': 5,
        'LR': 6, 'SL': 8, 'CD': 15, 'MW': 15
      };
      return roadData[code] || 15;
    },
    unit: 'km/100km²',
    format: (val) => `${Math.round(val)}`
  },
  internet_users: {
    id: 'internet_users',
    name: 'Internet Users (%)',
    category: 'Infrastructure',
    getter: (feat) => {
      const iso2 = getCountryCode(feat);
      const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3;
      return globalDataCache.worldBank.internet_users_pct?.[iso3] || 0;
    },
    unit: '%',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },
  renewable_electricity: {
    id: 'renewable_electricity',
    name: 'Renewable Electricity (%)',
    category: 'Infrastructure',
    getter: (feat) => {
      const iso2 = getCountryCode(feat);
      const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3;
      return globalDataCache.worldBank.renewable_electricity_pct?.[iso3] || 0;
    },
    unit: '%',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },
  electricity_access: {
    id: 'electricity_access', name: 'Electricity Access (%)', category: 'Infrastructure',
    getter: (feat) => { const iso2 = getCountryCode(feat); const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3; return globalDataCache.worldBank.electricity_access?.[iso3] || 0; },
    unit: '%', format: (val) => `${Math.round(val * 10) / 10}%`
  },
  clean_water_access: {
    id: 'clean_water_access', name: 'Clean Water Access (%)', category: 'Infrastructure',
    getter: (feat) => { const iso2 = getCountryCode(feat); const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3; return globalDataCache.worldBank.clean_water_access?.[iso3] || 0; },
    unit: '%', format: (val) => `${Math.round(val * 10) / 10}%`
  },

  // ── TECHNOLOGY ────────────────────────────────────────────────────────────
  digital_competitiveness: {
    id: 'digital_competitiveness',
    name: 'Digital Competitiveness',
    category: 'Technology',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const digitalData = {
        'US': 100, 'SG': 98, 'DK': 96, 'SE': 94, 'HK': 92, 'CH': 90, 'NL': 88, 'KR': 86,
        'NO': 84, 'FI': 82, 'TW': 80, 'GB': 78, 'CA': 76, 'LU': 74, 'IL': 72, 'AU': 70,
        'FR': 68, 'AT': 66, 'DE': 64, 'NZ': 62, 'IE': 60, 'EE': 58, 'JP': 56, 'BE': 54,
        'ES': 52, 'IT': 50, 'CZ': 48, 'PT': 46, 'SI': 44, 'LT': 42, 'PL': 40, 'SK': 38,
        'LV': 36, 'HU': 34, 'GR': 32, 'HR': 30, 'RO': 28, 'BG': 26, 'TR': 24, 'RU': 22,
        'CN': 20, 'BR': 18, 'MX': 16, 'AR': 14, 'CL': 12, 'CO': 10, 'PE': 8, 'IN': 6,
        'ZA': 4, 'TH': 2, 'ID': 1, 'PH': 0.5, 'VN': 0.3, 'EG': 0.2, 'NG': 0.1
      };
      return digitalData[code] || 5;
    },
    unit: 'score',
    format: (val) => `${Math.round(val)}`
  },
  innovation_index: {
    id: 'innovation_index',
    name: 'Global Innovation Index',
    category: 'Technology',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const giiData = {
        'CH': 68.2, 'SE': 64.8, 'US': 61.8, 'GB': 60.4, 'SG': 59.8, 'FI': 59.7, 'NL': 58.8,
        'DE': 58.4, 'DK': 57.5, 'KR': 56.8, 'JP': 54.5, 'HK': 54.1, 'FR': 53.8, 'CA': 53.7,
        'AT': 52.8, 'IL': 52.7, 'NO': 52.6, 'AU': 52.0, 'BE': 51.0, 'IE': 50.5, 'LU': 50.4,
        'IS': 49.6, 'NZ': 48.8, 'EE': 48.6, 'CN': 46.6, 'CZ': 46.0, 'LT': 44.8, 'IT': 44.7,
        'ES': 44.0, 'PT': 43.9, 'SI': 43.8, 'CY': 42.6, 'MT': 42.3, 'LV': 41.5, 'HU': 40.1,
        'PL': 39.8, 'SK': 39.4, 'GR': 38.9, 'HR': 37.8, 'BG': 36.4, 'RO': 35.8, 'TR': 35.5,
        'MY': 35.5, 'CL': 35.0, 'TH': 34.5, 'MX': 33.1, 'BR': 32.5, 'IN': 31.9, 'VN': 31.4,
        'PH': 30.8, 'ZA': 30.5, 'AR': 29.6, 'CO': 29.0, 'PE': 28.5, 'EG': 26.8, 'KE': 26.6
      };
      return giiData[code] || 25;
    },
    unit: 'score',
    format: (val) => `${Math.round(val * 10) / 10}`
  },

  // ── HEALTH ────────────────────────────────────────────────────────────────
  life_expectancy: {
    id: 'life_expectancy',
    name: 'Life Expectancy',
    category: 'Health',
    getter: (feat) => {
      const iso2 = getCountryCode(feat);
      const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3;
      return globalDataCache.worldBank.life_expectancy?.[iso3] || 0;
    },
    unit: 'years',
    format: (val) => `${Math.round(val * 10) / 10} years`
  },
  education_expenditure: {
    id: 'education_expenditure',
    name: 'Education Spending (% GDP)',
    category: 'Health',
    getter: (feat) => {
      const iso2 = getCountryCode(feat);
      const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3;
      return globalDataCache.worldBank.education_expenditure_pct?.[iso3] || 0;
    },
    unit: '% GDP',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },
  healthcare_expenditure: {
    id: 'healthcare_expenditure',
    name: 'Healthcare Expenditure (% GDP)',
    category: 'Health',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const healthData = {
        'US': 17.8, 'DE': 11.7, 'FR': 11.3, 'AT': 10.4, 'CH': 10.9, 'NL': 10.2, 'SE': 10.9,
        'BE': 10.7, 'CA': 10.8, 'JP': 10.9, 'NO': 10.5, 'DK': 10.1, 'GB': 10.9, 'IT': 8.7,
        'FI': 9.2, 'AU': 9.3, 'ES': 9.7, 'IS': 8.3, 'PT': 9.5, 'SI': 8.5, 'NZ': 9.7, 'CZ': 7.8,
        'SK': 6.7, 'EE': 7.7, 'LV': 7.2, 'LT': 7.5, 'PL': 6.5, 'HU': 7.4, 'HR': 7.8, 'GR': 7.7,
        'CY': 6.8, 'MT': 8.7, 'IE': 7.1, 'LU': 5.4, 'RU': 5.6, 'BY': 6.1, 'UA': 7.1, 'MD': 7.3,
        'RO': 5.7, 'BG': 8.5, 'AL': 6.7, 'BA': 9.4, 'ME': 8.7, 'MK': 7.9, 'RS': 8.7, 'XK': 3.3,
        'TR': 4.3, 'AM': 10.1, 'AZ': 4.6, 'GE': 7.6, 'KZ': 3.8, 'KG': 6.5, 'TJ': 7.2, 'TM': 6.1,
        'UZ': 6.9, 'MN': 4.9, 'CN': 5.4, 'KP': 0.0, 'KR': 8.1, 'TW': 6.6,
        'IN': 3.5, 'BD': 2.6, 'BT': 3.6, 'LK': 4.1, 'MV': 9.4, 'NP': 5.8, 'PK': 3.4, 'AF': 15.6,
        'IR': 5.3, 'IQ': 2.5, 'SY': 0.0, 'JO': 7.4, 'LB': 8.6, 'IL': 7.5, 'YE': 4.3,
        'OM': 4.7, 'SA': 5.7, 'AE': 3.8, 'QA': 2.6, 'KW': 3.0, 'BH': 4.9, 'TH': 3.8, 'VN': 6.1,
        'KH': 7.5, 'LA': 2.9, 'MM': 4.9, 'MY': 4.1, 'SG': 4.1, 'ID': 3.4, 'PH': 5.1, 'BN': 2.4,
        'TL': 1.5, 'PG': 2.5, 'SB': 4.4, 'VU': 3.8, 'FJ': 3.8, 'WS': 5.3,
        'TO': 5.2, 'KI': 11.6, 'TV': 16.5, 'MH': 17.1, 'FM': 13.7, 'PW': 9.0, 'BR': 9.6,
        'AR': 9.5, 'CL': 9.1, 'UY': 9.2, 'PY': 7.2, 'BO': 6.9, 'PE': 5.2, 'EC': 8.5, 'CO': 7.7,
        'VE': 1.6, 'GY': 4.9, 'SR': 6.0, 'MX': 5.4, 'GT': 5.8, 'BZ': 5.8, 'SV': 7.2, 'HN': 8.7,
        'NI': 8.6, 'CR': 7.3, 'PA': 7.3, 'CU': 11.7, 'JM': 6.0,
        'HT': 7.6, 'DO': 6.1, 'TT': 7.0, 'BB': 7.5, 'LC': 6.8, 'VC': 4.5, 'GD': 5.8,
        'AG': 4.9, 'KN': 5.1, 'DM': 6.0, 'ZA': 8.1, 'BW': 6.2, 'NA': 8.9, 'LS': 12.8,
        'SZ': 7.2, 'ZW': 4.7, 'ZM': 4.9, 'MW': 9.3, 'MZ': 8.0, 'MG': 5.9, 'KM': 7.6,
        'MU': 6.0, 'SC': 4.4, 'CV': 5.9, 'ST': 5.6, 'NG': 3.9, 'GH': 3.5, 'CI': 4.2,
        'BF': 5.6, 'ML': 4.3, 'SN': 4.8, 'GM': 3.1, 'GW': 8.0, 'GN': 4.6, 'SL': 16.0,
        'LR': 9.5, 'TG': 6.0, 'BJ': 2.6, 'NE': 7.4, 'MR': 5.0, 'DZ': 6.3, 'TN': 7.3,
        'LY': 0.0, 'EG': 5.3, 'SD': 8.4, 'SS': 2.7, 'ET': 3.5, 'ER': 3.8, 'DJ': 2.3,
        'SO': 0.0, 'KE': 5.2, 'UG': 7.2, 'TZ': 3.6, 'RW': 7.5, 'BI': 7.5, 'CD': 3.3,
        'CF': 11.0, 'TD': 4.5, 'CM': 3.8, 'GQ': 2.9, 'GA': 3.4, 'CG': 2.1, 'AO': 2.6
      };
      return healthData[code] || 5.0;
    },
    unit: '% GDP',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },
  hdi: {
    id: 'hdi', name: 'Human Dev. Index (HDI)', category: 'Health',
    getter: (feat) => HDI_DATA[getCountryCode(feat)] || 0,
    unit: 'index', format: (val) => `${Math.round(val * 1000) / 1000}`
  },

  // ── GOVERNANCE ────────────────────────────────────────────────────────────
  corruption_index: {
    id: 'corruption_index',
    name: 'Corruption Perception Index',
    category: 'Governance',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const cpiData = {
        'DK': 90, 'FI': 87, 'NZ': 87, 'NO': 84, 'SG': 83, 'SE': 82, 'CH': 82, 'NL': 79,
        'DE': 78, 'LU': 78, 'AU': 77, 'CA': 76, 'HK': 76, 'GB': 76, 'BE': 76, 'IE': 77,
        'JP': 73, 'EE': 76, 'FR': 71, 'AT': 71, 'US': 69, 'UY': 74, 'SI': 64, 'CY': 59,
        'CZ': 56, 'LT': 62, 'LV': 59, 'ES': 60, 'PT': 62, 'IT': 56, 'PL': 54, 'SK': 53,
        'KR': 63, 'IL': 63, 'CL': 67, 'CR': 58, 'BW': 55, 'RW': 51, 'JO': 47, 'MY': 47,
        'GH': 43, 'SA': 42, 'CN': 42, 'IN': 39, 'BR': 38, 'ZA': 41, 'TR': 34, 'MX': 31,
        'AR': 31, 'EG': 30, 'TH': 33, 'PH': 33, 'VN': 31, 'ID': 34, 'NG': 25, 'RU': 26,
        'PK': 27, 'BD': 25, 'KE': 32, 'UG': 26, 'TZ': 38, 'ZM': 33, 'MW': 35, 'MZ': 26
      };
      return cpiData[code] || 35;
    },
    unit: 'score',
    format: (val) => `${Math.round(val)}/100`
  },
  democracy_index: {
    id: 'democracy_index', name: 'Democracy Index', category: 'Governance',
    getter: (feat) => DEMOCRACY_DATA[getCountryCode(feat)] || 0,
    unit: '/10', format: (val) => `${Math.round(val * 100) / 100}/10`
  },
  press_freedom: {
    id: 'press_freedom', name: 'Press Freedom Index', category: 'Governance',
    getter: (feat) => PRESS_FREEDOM_DATA[getCountryCode(feat)] || 0,
    unit: '/100', format: (val) => `${Math.round(val * 10) / 10}/100`
  },
  peace_index: {
    id: 'peace_index', name: 'Global Peace Index', category: 'Governance',
    getter: (feat) => {
      const v = PEACE_INDEX_DATA[getCountryCode(feat)];
      return v ? Math.round((3.5 - v) * 1000) / 1000 : 0;
    },
    unit: 'index', format: (val) => `${Math.round(val * 100) / 100}`
  },

  // ── ENVIRONMENT ───────────────────────────────────────────────────────────
  forest_area: {
    id: 'forest_area',
    name: 'Forest Area (%)',
    category: 'Environment',
    getter: (feat) => {
      const iso2 = getCountryCode(feat);
      const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3;
      return globalDataCache.worldBank.forest_area_pct?.[iso3] || 0;
    },
    unit: '%',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },
  co2_emissions: {
    id: 'co2_emissions',
    name: 'CO2 Emissions (t/capita)',
    category: 'Environment',
    getter: (feat) => {
      const iso2 = getCountryCode(feat);
      const iso3 = ISO2_TO_ISO3[iso2] || feat.properties.ISO_A3;
      return globalDataCache.worldBank.co2_emissions_per_capita?.[iso3] || 0;
    },
    unit: 't/capita',
    format: (val) => `${Math.round(val * 10) / 10}t`
  },

  // ── GEOGRAPHY ─────────────────────────────────────────────────────────────
  landlocked: {
    id: 'landlocked', name: 'Landlocked', category: 'Geography',
    getter: (feat) => { const code = getCountryCode(feat); return globalDataCache.restCountries[code]?.landlocked || 0; },
    unit: '', format: (val) => val ? 'Yes' : 'No'
  },
  languages_count: {
    id: 'languages_count', name: 'Official Languages', category: 'Geography',
    getter: (feat) => { const code = getCountryCode(feat); return globalDataCache.restCountries[code]?.languages || 0; },
    unit: '', format: (val) => `${val}`
  },
  timezones_count: {
    id: 'timezones_count', name: 'Time Zones', category: 'Geography',
    getter: (feat) => { const code = getCountryCode(feat); return globalDataCache.restCountries[code]?.timezones || 0; },
    unit: '', format: (val) => `${val}`
  },

  // ── CULTURE ───────────────────────────────────────────────────────────────
  tourism_arrivals: {
    id: 'tourism_arrivals',
    name: 'Tourism Arrivals (millions)',
    category: 'Culture',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const touristHotspots = { 'FR': 90, 'ES': 85, 'US': 80, 'CN': 65, 'IT': 65, 'TR': 50, 'MX': 45, 'TH': 40, 'DE': 40, 'GB': 38 };
      if (touristHotspots[code]) return touristHotspots[code];
      return null;
    },
    unit: 'M',
    format: (val) => `${Math.round(val * 10) / 10}M`
  },
  coffee_production: {
    id: 'coffee_production',
    name: 'Coffee Production (tonnes)',
    category: 'Culture',
    getter: (feat) => {
      const code = getCountryCode(feat);
      const majorProducers = { 'BR': 3000000, 'VN': 1800000, 'CO': 800000, 'ID': 700000, 'ET': 400000, 'HN': 350000, 'IN': 300000, 'UG': 280000, 'MX': 250000, 'GT': 200000 };
      if (majorProducers[code]) return majorProducers[code];
      return null;
    },
    unit: 'tonnes',
    format: (val) => val > 1000 ? `${Math.round(val / 1000)}K tonnes` : `${Math.round(val)} tonnes`
  },
  crop_yield: {
    id: 'crop_yield',
    name: 'Crop Yield Index',
    category: 'Culture',
    getter: (feat) => {
      const gdp = feat.properties.GDP_MD_EST || 0;
      const area = feat.properties.AREA || 1;
      const pop = feat.properties.POP_EST || 1;
      const gdpPerCapita = gdp * 1000000 / pop;
      const landPerPerson = area / pop * 1000000;
      return Math.max(50, Math.min(200, 80 + Math.log(gdpPerCapita + 1) * 5 + Math.log(landPerPerson + 1) * 10));
    },
    unit: 'index',
    format: (val) => `${Math.round(val)}`
  },
  unesco_sites: {
    id: 'unesco_sites', name: 'UNESCO Heritage Sites', category: 'Culture',
    getter: (feat) => { const code = getCountryCode(feat); return (globalDataCache.unesco?.[code] || UNESCO_FALLBACK[code]) || 0; },
    unit: 'sites', format: (val) => `${val} sites`
  },
};


// Create HEIGHT_GETTERS from AVAILABLE_DATASETS with validation
const HEIGHT_GETTERS = Object.fromEntries(
  Object.entries(AVAILABLE_DATASETS)
    .filter(([key, dataset]) => !dataset.disabled) // Skip disabled datasets
    .map(([key, dataset]) => [
      key,
      (feat) => {
        try {
          const value = dataset.getter(feat);
          return isNaN(value) || value < 0 ? 0 : value;
        } catch (error) {
          console.warn(`Error calculating ${key} for country:`, error);
          return 0;
        }
      }
    ])
);

// ── Geo SVG helpers ──────────────────────────────────────────────────────────

function getCoordsBBox(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (c) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') { minX=Math.min(minX,c[0]); maxX=Math.max(maxX,c[0]); minY=Math.min(minY,c[1]); maxY=Math.max(maxY,c[1]); }
    else c.forEach(walk);
  };
  features.forEach(f => f?.geometry && walk(f.geometry.coordinates));
  return { minX, minY, maxX, maxY };
}

function largestPolygonRings(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') {
    let best = null, bestArea = -Infinity;
    for (const poly of geometry.coordinates) {
      const ring = poly[0];
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) area += ring[i][0]*ring[i+1][1] - ring[i+1][0]*ring[i][1];
      const a = Math.abs(area)/2;
      if (a > bestArea) { bestArea = a; best = poly; }
    }
    return best;
  }
  return null;
}

function ringCentroid(ring) {
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
}

// Normalise a longitude to be within 180° of a reference meridian.
// Handles dateline crossing in both directions.
function normaliseLon(lon, refLon) {
  while (lon - refLon >  180) lon -= 360;
  while (refLon - lon >  180) lon += 360;
  return lon;
}

// Returns all outer rings of a geometry whose centroid falls within (padded) bbox.
// Uses bbox.medianLon to normalise dateline-crossing coordinates.
function ringsInBBox(geometry, bbox, pad = 0.25) {
  const pw = (bbox.maxX - bbox.minX) * pad;
  const ph = (bbox.maxY - bbox.minY) * pad;
  const ref = bbox.medianLon ?? (bbox.minX + bbox.maxX) / 2;

  const outerRings = [];
  if (geometry?.type === 'Polygon') outerRings.push(geometry.coordinates[0]);
  else if (geometry?.type === 'MultiPolygon') geometry.coordinates.forEach(p => outerRings.push(p[0]));

  return outerRings.filter(ring => {
    const [cx, cy] = ringCentroid(ring);
    const nx = normaliseLon(cx, ref);
    return nx >= bbox.minX - pw && nx <= bbox.maxX + pw &&
           cy >= bbox.minY - ph && cy <= bbox.maxY + ph;
  });
}

function ringToPath(ring, project, refLon = 0) {
  return ring.map((p, i) => {
    const [x, y] = project(normaliseLon(p[0], refLon), p[1]);
    return `${i===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

function makeSvgProjection(bbox, svgSize, padding = 0.06) {
  const pw = (bbox.maxX - bbox.minX) * padding;
  const ph = (bbox.maxY - bbox.minY) * padding;
  const minX = bbox.minX - pw, maxX = bbox.maxX + pw;
  const minY = bbox.minY - ph, maxY = bbox.maxY + ph;
  const w = maxX - minX, h = maxY - minY;
  const scale = Math.min(svgSize / w, svgSize / h) * 0.92;
  const ox = (svgSize - w * scale) / 2;
  const oy = (svgSize - h * scale) / 2;
  return (lon, lat) => [(lon - minX) * scale + ox, (maxY - lat) * scale + oy];
}

// South polar azimuthal equidistant projection — gives Antarctica its correct circular shape.
function makePolarSouthProjection(svgSize) {
  const cx = svgSize / 2, cy = svgSize / 2;
  const maxRho = 35; // degrees from south pole, covers ~-55° lat
  const scale = (svgSize / 2) * 0.88 / maxRho;
  return (lon, lat) => {
    const rho = 90 + lat;
    const theta = lon * Math.PI / 180;
    return [cx + scale * rho * Math.sin(theta), cy - scale * rho * Math.cos(theta)];
  };
}

function getAllOuterRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map(p => p[0]);
  return [];
}

// Russia's GeoJSON CONTINENT is Europe; override to Asia so it groups correctly
const CONTINENT_OVERRIDES = { RU: 'Asia' };

function getFeatureContinent(f) {
  const code = f.properties?.ISO_A2 || f.properties?.ADM0_A3?.slice(0, 2);
  return CONTINENT_OVERRIDES[code] || f.properties?.CONTINENT;
}

// Continent bbox from largest polygon per country, with dateline-aware clustering.
// Finds the median longitude across all country centroids, then normalises all
// coordinates to within 180° of that median so Tonga (-175°) sits next to Fiji
// instead of pulling the bbox across the entire world.
function getContinentBBox(continentFeats) {
  const entries = continentFeats.map(f => {
    const rings = largestPolygonRings(f.geometry);
    if (!rings) return null;
    return { ring: rings[0] };
  }).filter(Boolean);

  if (!entries.length) return { minX: -180, maxX: 180, minY: -90, maxY: 90, medianLon: 0 };

  // Median centroid longitude (as-is) to seed the cluster reference
  const rawLons = entries.map(e => ringCentroid(e.ring)[0]).sort((a, b) => a - b);
  const medianLon = rawLons[Math.floor(rawLons.length / 2)];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { ring } of entries) {
    for (const p of ring) {
      const nx = normaliseLon(p[0], medianLon);
      if (nx < minX) minX = nx;
      if (nx > maxX) maxX = nx;
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  return { minX, maxX, minY, maxY, medianLon };
}

// Hex card dimensions — exported for honeycomb layout math
const HEX_W = 108, HEX_H = 94;
// Honeycomb packing constants (pointy-top hex geometry)
const HEX_COL_STEP   = Math.round(HEX_W * 0.732);   // center-to-center horizontal
const HEX_ROW_STEP   = Math.round(HEX_H * 0.75);     // center-to-center vertical
const HEX_ODD_OFFSET = Math.round(HEX_COL_STEP / 2); // odd-row horizontal shift
const HEX_H_OVERLAP  = HEX_W - HEX_COL_STEP;         // negative margin per item in row
const HEX_V_OVERLAP  = HEX_H - HEX_ROW_STEP;         // negative margin between rows

const CountryHexCard = React.memo(({ feature, allFeatures, clipId, onClick, modeValue }) => {
  const name = feature.properties?.NAME || feature.properties?.ADMIN || 'Unknown';
  const continent = getFeatureContinent(feature);
  const SVG = modeValue != null ? 48 : 56;

  const { continentPath, countryPath, hx, hy } = useMemo(() => {
    const continentFeats = allFeatures.filter(f => getFeatureContinent(f) === continent);
    if (!continentFeats.length) return { continentPath: '', countryPath: '', hx: SVG/2, hy: SVG/2 };

    if (continent === 'Antarctica') {
      const project = makePolarSouthProjection(SVG);
      const cPath = continentFeats.map(f =>
        getAllOuterRings(f.geometry).map(r => ringToPath(r, project, 0)).join(' ')
      ).join(' ');
      const kPath = getAllOuterRings(feature.geometry).map(r => ringToPath(r, project, 0)).join(' ');
      return { continentPath: cPath, countryPath: kPath, hx: SVG/2, hy: SVG/2 };
    }

    const bbox = getContinentBBox(continentFeats);
    const project = makeSvgProjection(bbox, SVG);

    const bMinX = bbox.minX;

    const cPath = continentFeats.map(f => {
      const rings = ringsInBBox(f.geometry, bbox);
      return rings.map(r => ringToPath(r, project, bMinX)).join(' ');
    }).join(' ');

    const kRings = ringsInBBox(feature.geometry, bbox);
    const kPath = kRings.map(r => ringToPath(r, project, bMinX)).join(' ');

    const mainRings = largestPolygonRings(feature.geometry);
    const mainRing = mainRings ? mainRings[0] : (kRings[0] || null);
    const [cx, cy] = mainRing
      ? project(normaliseLon(ringCentroid(mainRing)[0], bMinX), ringCentroid(mainRing)[1])
      : [SVG/2, SVG/2];

    return { continentPath: cPath, countryPath: kPath, hx: cx, hy: cy };
  }, [feature, allFeatures, continent]);

  const maskId = `hm-${clipId}`;

  return (
    <div
      onClick={onClick}
      style={{ width: HEX_W, height: HEX_H, position:'relative', cursor:'pointer', userSelect:'none', flexShrink:0 }}
    >
      {/* dark hex bg */}
      <div style={{ position:'absolute', inset:0, background:'#252525',
        clipPath:'polygon(50% 0%, 86.6% 25%, 86.6% 75%, 50% 100%, 13.4% 75%, 13.4% 25%)' }} />
      {/* hex content: circle at top, name pinned to bottom — both clipped to hex */}
      <div style={{
        position:'absolute', inset:0,
        clipPath:'polygon(50% 0%, 86.6% 25%, 86.6% 75%, 50% 100%, 13.4% 75%, 13.4% 25%)',
        display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'space-between',
        paddingTop: 8, paddingBottom: 12,
      }}>
        {/* continent + country mini-map */}
        <svg width={SVG} height={SVG} viewBox={`0 0 ${SVG} ${SVG}`} style={{ flexShrink:0 }}>
          <defs>
            <mask id={maskId}>
              <circle cx={SVG/2} cy={SVG/2} r={SVG/2} fill="white" />
            </mask>
          </defs>
          <circle cx={SVG/2} cy={SVG/2} r={SVG/2} fill="#3a3a3a" />
          <g mask={`url(#${maskId})`}>
            {continentPath && <path d={continentPath} fill="white" fillOpacity="0.7" />}
            <circle cx={hx} cy={hy} r={13} fill="#555" fillOpacity="0.75" />
            {countryPath && <path d={countryPath} fill="white" />}
          </g>
        </svg>
        {/* text zone */}
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end',
          maxWidth: HEX_W * 0.7, gap: '0px'
        }}>
          {modeValue != null && (
            <div style={{
              fontSize:'10px', color:'white', textAlign:'center',
              fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              lineHeight:1.1, whiteSpace:'nowrap'
            }}>
              {modeValue}
            </div>
          )}
          <div style={{
            height: '18px', display:'flex', alignItems:'center', justifyContent:'center',
            maxWidth: HEX_W * 0.55,
          }}>
            <div style={{
              fontSize:'9px', color:'white', textAlign:'center',
              fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              lineHeight:1.1,
              overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2,
              WebkitBoxOrient:'vertical'
            }}>
              {name}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// Measures the card's rendered position and translates the animation to start
// from the globe click point, flowing smoothly into the grid slot.
const FlyInCard = ({ clickPos, onDone, children }) => {
  const ref = useRef(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !clickPos) return;
    const rect = el.getBoundingClientRect();
    const dx = clickPos.x - (rect.left + rect.width / 2);
    const dy = clickPos.y - (rect.top  + rect.height / 2);
    // WAAPI: translate BEFORE scale so displacement is in screen pixels, not scaled space.
    // Plain ease-out — no overshoot, straight path to slot.
    const anim = el.animate([
      { opacity: 0, transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.18)` },
      { opacity: 1, transform: 'translate(0px, 0px) scale(1)' }
    ], { duration: 520, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' });
    anim.onfinish = () => onDone?.();
    return () => anim.cancel();
  }, []);
  return <div ref={ref} style={{ opacity: 0 }}>{children}</div>;
};

// ─────────────────────────────────────────────────────────────────────────────

const ECLIPSE_REGIONS = ['Europe', 'N. America', 'S. America', 'Africa', 'Asia', 'Oceania'];

const ECLIPSE_REGION_COUNTRIES = {
  'Europe':     new Set([...REGIONS.southwest_europe, ...REGIONS.south_europe, ...REGIONS.central_europe,
                         ...REGIONS.west_europe, ...REGIONS.north_europe, ...REGIONS.southeast_europe,
                         ...REGIONS.east_europe]),
  'N. America': new Set([...REGIONS.north_america, ...REGIONS.central_america_caribbean]),
  'S. America': new Set(REGIONS.south_america),
  'Africa':     new Set([...REGIONS.north_africa, ...REGIONS.central_africa, ...REGIONS.east_africa,
                         ...REGIONS.west_africa, ...REGIONS.south_africa]),
  'Asia':       new Set([...REGIONS.middle_east, ...REGIONS.indian_subcontinent,
                         ...REGIONS.central_asia, ...REGIONS.eastern_asia]),
  'Oceania':    new Set(REGIONS.oceania),
};

const BID_CATEGORIES = [
  { id: 'gdp', label: 'GDP' },
  { id: 'area', label: 'Area' },
  { id: 'population', label: 'Population' },
  { id: 'neighbors', label: 'Neighbors' },
  { id: 'forest_area', label: 'Forest' },
  { id: 'internet_users', label: 'Internet' },
  { id: 'military_expenditure', label: 'Military' },
];

const GlobeWrapper = ({
  selectedCountries = [],
  onCountrySelect,
  gamePhase,
  currentPlayer,
  playerCountries = {},
  teamColors = {},
  selectedDatasets = [],
  dataLoading = false,
  useDataDrivenRegions = false,
  setUseDataDrivenRegions,
  timerDuration = 10,
  biddingTimerDuration = 20,
  onPlayerChange,
  viewedPlayer = 0,
  onViewedPlayerChange,
  eclipseEnabled = true,
  claimedCountries = {},
  onConsumePlayedCards,
  playTimerDuration = 20,
  cardsToPlay = 1,
  onPhaseChange,
  currentRound = 1,
  numRounds = 1,
  alliancePenaltyAmount = 5,
  bidPenaltyAmount = 20
}) => {
  const [countries, setCountries] = useState({ features: [] });
  const [hoverD, setHoverD] = useState(null);
  const [heightFilter, setHeightFilter] = useState('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [animatingCode, setAnimatingCode] = useState(null);
  const clickPosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const prevPlayerCountriesRef = useRef(playerCountries);
  const [regionBoundaries, setRegionBoundaries] = useState([]);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [timerCycle, setTimerCycle] = useState(0);
  const autoSelectRef = useRef(null);
  const timerFillRef = useRef(null);

  // Bidding state
  const [biddingCurrentBidderIdx, setBiddingCurrentBidderIdx] = useState(0);
  const [biddingHighBid, setBiddingHighBid] = useState(null); // {teamIdx, amount, category}
  const [biddingConsecPasses, setBiddingConsecPasses] = useState(0);
  const [myBidAmount, setMyBidAmount] = useState(1);
  const [myBidCategory, setMyBidCategory] = useState('gdp');
  const [myEclipseRegion, setMyEclipseRegion] = useState('Europe');
  const [eclipseRegion, setEclipseRegion] = useState('Europe');
  const [playedCards, setPlayedCards] = useState({}); // { playerIdx: [code, ...] }
  const [playCurrentPlayer, setPlayCurrentPlayer] = useState(0);
  const [handsWon, setHandsWon] = useState({}); // { player1: 0, ... }
  const [playRoundWinner, setPlayRoundWinner] = useState(null);
  const [playTimerCycle, setPlayTimerCycle] = useState(0);
  const [animatingPlayCode, setAnimatingPlayCode] = useState(null);
  const [playCountdown, setPlayCountdown] = useState(null);
  const playCardClickPosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [biddingTimerCycle, setBiddingTimerCycle] = useState(0);
  const [biddingWinner, setBiddingWinner] = useState(null); // {teamIdx, amount, category}
  const biddingWinnerRef = useRef(null);
  const [biddingEndCountdown, setBiddingEndCountdown] = useState(null);
  const [biddingLog, setBiddingLog] = useState([]); // [{teamIdx, type:'bid'|'pass'|'win'|'nowin', amount, category}]
  const [biddingBidCount, setBiddingBidCount] = useState(0); // number of bids placed this auction
  const [currentMode, setCurrentMode] = useState('area'); // updates to winning bid's category

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    return countries.features
      .filter(f => {
        const n = (f.properties?.NAME || f.properties?.ADMIN || '').toLowerCase();
        return n.includes(q);
      })
      .slice(0, 50);
  }, [searchQuery, countries.features]);

  // Detect newly added country and trigger fly-in animation
  useEffect(() => {
    const prev = prevPlayerCountriesRef.current;
    for (const key of Object.keys(playerCountries)) {
      const prevList = prev[key] || [];
      const currList = playerCountries[key] || [];
      const newCode = currList.find(c => !prevList.includes(c));
      if (newCode) { setAnimatingCode(newCode); break; }
    }
    prevPlayerCountriesRef.current = playerCountries;
  }, [playerCountries]);

  // Memoized country region lookup with data-driven fallback
  const getCountryRegion = useCallback((country) => {
    const countryCode = getCountryCode(country);

    if (useDataDrivenRegions) {
      // Use data-driven regions
      const continent = country.properties?.CONTINENT || 'Unknown';
      const subregion = country.properties?.SUBREGION || country.properties?.REGION_UN || 'Unknown';



      if (continent === 'Europe') {
        return `europe_${subregion}`.toLowerCase().replace(/[\s&]+/g, '_');
      } else if (continent === 'Africa') {
        return `africa_${subregion}`.toLowerCase().replace(/[\s&]+/g, '_');
      } else if (continent === 'Asia') {
        return `asia_${subregion}`.toLowerCase().replace(/[\s&]+/g, '_');
      } else if (continent === 'North America') {
        return subregion === 'Northern America' ? 'north_america' : 'central_america_caribbean';
      } else if (continent === 'South America') {
        return 'south_america';
      } else if (continent === 'Oceania') {
        return `oceania_${subregion}`.toLowerCase().replace(/[\s&]+/g, '_');
      }

      return continent.toLowerCase().replace(/[\s&]+/g, '_');
    } else {
      // Use manual regions
      const manualRegion = REGION_MAPPING[countryCode];
      return manualRegion || 'unknown';
    }
  }, [useDataDrivenRegions]);

  // Memoized polygon data
  const polygonData = useMemo(() =>
    countries.features.length ? createPolygonData(countries.features) : [],
    [countries.features]
  );

  // Memoized statistical values with outlier detection and adjustment
  const heightStats = useMemo(() => {
    if (!countries.features.length || heightFilter === 'none') {
      return { max: 1, min: 0, mean: 0.5, median: 0.5, values: [], adjustedMax: 1, outliers: [] };
    }

    const heightGetter = HEIGHT_GETTERS[heightFilter];
    const values = countries.features.map(heightGetter).filter(v => v > 0).sort((a, b) => a - b);

    if (values.length === 0) {
      return { max: 1, min: 0, mean: 0.5, median: 0.5, values: [], adjustedMax: 1, outliers: [] };
    }

    const max = Math.max(...values);
    const min = Math.min(...values);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const median = values.length % 2 === 0
      ? (values[Math.floor(values.length / 2) - 1] + values[Math.floor(values.length / 2)]) / 2
      : values[Math.floor(values.length / 2)];

    // Outlier detection using IQR method and extreme ratio analysis
    const q1 = values[Math.floor(values.length * 0.25)];
    const q3 = values[Math.floor(values.length * 0.75)];
    const p95 = values[Math.floor(values.length * 0.95)];
    const p99 = values[Math.floor(values.length * 0.99)];

    const iqr = q3 - q1;
    const outlierThreshold = q3 + (iqr * 2.5); // More aggressive than standard 1.5

    // Check if max value is crushing others
    const maxToP95Ratio = max / Math.max(p95, 1);
    const maxToMeanRatio = max / Math.max(mean, 1);
    const maxToMedianRatio = max / Math.max(median, 1);

    // Detect extreme outliers that crush the visualization
    const isExtremeCrusher = (
      maxToP95Ratio > 3.0 ||  // Max is 3x larger than 95th percentile
      maxToMeanRatio > 8.0 ||  // Max is 8x larger than mean
      maxToMedianRatio > 10.0 || // Max is 10x larger than median
      max > outlierThreshold    // Standard IQR outlier
    );

    let adjustedMax = max;
    let outliers = [];

    if (isExtremeCrusher) {
      // Find all extreme outliers
      outliers = values.filter(v =>
        v > outlierThreshold ||
        v / Math.max(p95, 1) > 2.5 ||
        v / Math.max(mean, 1) > 6.0
      );

      // Set adjusted max to a more reasonable value
      // Use the higher of: 95th percentile * 1.5, or mean * 3, or median * 4
      const option1 = p95 * 1.5;
      const option2 = mean * 3.0;
      const option3 = median * 4.0;

      adjustedMax = Math.max(option1, option2, option3);

      // Ensure adjusted max is reasonable but not too low
      adjustedMax = Math.max(adjustedMax, max * 0.3); // At least 30% of original max
      adjustedMax = Math.min(adjustedMax, max * 0.8); // At most 80% of original max
    }

    return { max, min, mean, median, values, adjustedMax, outliers };
  }, [countries.features, heightFilter]);

  // Load and process countries data
  useEffect(() => {
    let mounted = true;

    fetch('/data/polygons.geojson')
      .then(res => res.json())
      .then(data => {
        if (!mounted) return;

        // Filter out excluded countries
        const filtered = data.features.filter(f => {
          const code = getCountryCode(f);
          return !EXCLUDED_COUNTRIES.has(code);
        });

        // TEMPORARY: Hide countries without region allocations
        const withRegionsOnly = filtered.filter(f => {
          const code = getCountryCode(f);
          return REGION_MAPPING[code]; // Only show countries that have a region assigned
        });

        const fixedData = rewind(
          { type: 'FeatureCollection', features: withRegionsOnly },
          { reverse: true }
        );

        setCountries(fixedData);
      })
      .catch(err => {
        if (mounted) {
          console.error('Error loading countries:', err);
          setCountries({ features: [] });
        }
      });

    return () => { mounted = false; };
  }, []);

  // Update region boundaries when data-driven mode changes
  useEffect(() => {
    if (countries.features && countries.features.length > 0) {
      const withRegionsOnly = countries.features.filter(f => {
        const code = getCountryCode(f);
        return REGION_MAPPING[code]; // Only show countries that have a region assigned
      });

      const boundaries = useDataDrivenRegions
        ? createDataDrivenRegionBoundaries(withRegionsOnly)
        : createManualRegionBoundaries(withRegionsOnly);
      setRegionBoundaries(boundaries);
    }
  }, [useDataDrivenRegions, countries.features]);

  // Optimized height function with improved statistical scaling
  const getPolygonHeight = useCallback((country) => {
    if (country.__layer === 'surface') return 0.00;

    const baseHeight = 0.005;
    const hoveredRegion = hoverD ? getCountryRegion(hoverD) : null;
    const countryRegion = getCountryRegion(country);

    let calculatedHeight = baseHeight;
    if (heightFilter !== 'none') {
      const heightGetter = HEIGHT_GETTERS[heightFilter];
      const value = heightGetter(country);
      const { max, min, mean, median, adjustedMax, outliers } = heightStats;
      const isOutlier = outliers.includes(value);

      if (value > 0 && max > min) {
        // Use adjusted max for normalization, but handle outliers specially
        const workingMax = adjustedMax;
        const range = workingMax - min;

        let normalized;
        if (isOutlier && value > workingMax) {
          // Outlier exceeds adjusted max - let it go beyond normal height limits
          normalized = 1.0 + ((value - workingMax) / (max - workingMax)) * 0.8; // Can go up to 1.8
        } else {
          // Normal normalization using adjusted max
          normalized = Math.min(1.0, (value - min) / range);
        }

        // Apply intelligent scaling based on dataset type and data distribution
        const dataset = AVAILABLE_DATASETS[heightFilter];
        const isBuiltIn = ['gdp', 'population', 'area', 'neighbors'].includes(heightFilter);

        if (isBuiltIn) {
          // Built-in datasets: use different scaling for each
          if (heightFilter === 'gdp') {
            // GDP: Linear scaling to preserve extreme differences
            normalized = normalized;
          } else if (heightFilter === 'area') {
            // Area: Mild logarithmic to compress huge countries
            normalized = Math.pow(normalized, 0.7);
          } else if (heightFilter === 'population') {
            // Population: Moderate logarithmic to balance mega-cities vs small countries
            normalized = Math.pow(normalized, 0.6);
          } else if (heightFilter === 'neighbors') {
            // Neighbors: Linear since range is small
            normalized = normalized;
          }
        } else {
          // ADAPTIVE LOGARITHMIC SYSTEM - transitions between reverse-log and regular-log
          const { values } = heightStats;
          const sortedValues = [...values].sort((a, b) => a - b);

          // Calculate distribution characteristics
          const stdDev = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length);
          const coefficientOfVariation = stdDev / Math.max(mean, 0.001);

          // Key percentiles for outlier detection
          const p75 = sortedValues[Math.floor(sortedValues.length * 0.75)];
          const p90 = sortedValues[Math.floor(sortedValues.length * 0.90)];
          const p95 = sortedValues[Math.floor(sortedValues.length * 0.95)];
          const p99 = sortedValues[Math.floor(sortedValues.length * 0.99)];

          // OUTLIER INTENSITY ANALYSIS
          // Calculate how extreme the outliers are
          const maxToP95Ratio = max / Math.max(p95, 0.001);
          const maxToP90Ratio = max / Math.max(p90, 0.001);
          const p99ToP90Ratio = p99 / Math.max(p90, 0.001);

          // Calculate top compression (how much of the range is taken by top 5%)
          const topCompression = (max - p95) / Math.max(max - min, 0.001);

          // ADAPTIVE EXPONENT CALCULATION
          // Start with neutral (linear = 1.0)
          let exponent = 1.0;

          // PHASE 1: Determine base tendency
          if (coefficientOfVariation < 0.4) {
            // Low variation - countries are similar, need reverse-log to create outliers
            exponent = 2.0 + (0.4 - coefficientOfVariation) * 2.5; // 2.0 to 3.0
          } else if (coefficientOfVariation > 1.2) {
            // High variation - likely has natural outliers, may need compression
            exponent = 1.0 - (coefficientOfVariation - 1.2) * 0.3; // 1.0 to 0.4
            exponent = Math.max(0.4, exponent); // Don't go too extreme
          } else {
            // Moderate variation - balanced approach
            exponent = 1.0 + (0.8 - Math.abs(coefficientOfVariation - 0.8)) * 1.5; // 1.0 to 2.2
          }

          // PHASE 2: Adjust based on outlier intensity
          if (maxToP95Ratio > 3.0) {
            // Extreme outliers detected - shift toward logarithmic compression
            const outlierIntensity = Math.min(1.0, (maxToP95Ratio - 3.0) / 7.0); // 0-1 scale
            exponent = exponent * (1.0 - outlierIntensity * 0.6); // Reduce exponent by up to 60%
          }

          if (topCompression > 0.3) {
            // Top values take up too much range - compress them
            const compressionFactor = Math.min(1.0, (topCompression - 0.3) / 0.4); // 0-1 scale
            exponent = exponent * (1.0 - compressionFactor * 0.4); // Reduce exponent by up to 40%
          }

          // PHASE 3: Fine-tune based on distribution shape
          if (p99ToP90Ratio > 2.0) {
            // Very steep increase in top 10% - needs compression
            exponent *= 0.8;
          }

          if (maxToP90Ratio > 5.0) {
            // Extreme single outlier - strong compression needed
            exponent = Math.min(exponent, 0.6);
          }

          // PHASE 4: Ensure reasonable bounds and smooth transitions
          if (exponent > 1.0) {
            // Reverse logarithmic mode (creates outliers)
            exponent = Math.max(1.1, Math.min(3.5, exponent));
          } else {
            // Regular logarithmic mode (compresses outliers)
            exponent = Math.max(0.3, Math.min(0.95, exponent));
          }

          // PHASE 5: Apply the adaptive logarithmic scaling
          normalized = Math.pow(normalized, exponent);

          // PHASE 6: Final smoothing to prevent extreme clustering
          if (exponent > 1.0 && normalized > 0.9) {
            // In reverse-log mode, gently compress the very top
            const topPortion = (normalized - 0.9) / 0.1;
            normalized = 0.9 + (topPortion * 0.1 * 0.85);
          } else if (exponent < 1.0 && normalized < 0.1) {
            // In log mode, lift the very bottom slightly
            const bottomPortion = normalized / 0.1;
            normalized = bottomPortion * 0.15;
          }
        }

        // Scale to height range - max should match cyan atmosphere (~0.5 altitude)
        let heightMultiplier = 0.25; // Base multiplier (reduced from 0.4)

        // Adjust multiplier based on data type and outlier status
        if (isBuiltIn) {
          heightMultiplier = 0.3; // Built-in data - max height ~0.3 (within atmosphere)
        } else if (dataset?.unit === '%') {
          heightMultiplier = 0.25; // Percentage data 
        } else if (dataset?.category === 'USGS Minerals' || dataset?.category === 'Energy Institute') {
          heightMultiplier = 0.28; // Resource data
        }

        // Handle outliers that exceed normal bounds
        if (isOutlier && normalized > 1.0) {
          // Outliers can exceed normal height limits for dramatic effect
          calculatedHeight = baseHeight + (heightMultiplier * 1.0) + ((normalized - 1.0) * heightMultiplier * 0.8);
        } else {
          calculatedHeight = normalized * heightMultiplier + baseHeight;
        }
      }
    }

    // Additive hover effects
    if (hoveredRegion && countryRegion === hoveredRegion) {
      if (country === hoverD) {
        return calculatedHeight + 0.05; // Direct hover
      } else {
        return calculatedHeight + 0.02; // Region hover
      }
    }

    if (country === hoverD) {
      return calculatedHeight + 0.01; // Direct hover when no region
    }

    return calculatedHeight;
  }, [hoverD, heightFilter, heightStats, getCountryRegion]);

  const getCountryColor = useCallback((country) => {
    if (country.__layer === 'surface') return 'transparent';

    const countryCode = getCountryCode(country);
    const hoveredRegion = hoverD ? getCountryRegion(hoverD) : null;
    const countryRegion = getCountryRegion(country);

    // Prioritize player colors regardless of height filter
    for (const [playerId, playerCountryList] of Object.entries(playerCountries)) {
      if (playerCountryList.includes(countryCode)) {
        return teamColors[playerId] || '#666666'; // Return player's color
      }
    }

    // When a height filter is active, apply transparency to non-player countries
    if (heightFilter !== 'none') {
      if (country === hoverD) return 'rgba(255, 255, 255, 0.5)'; // Brighter for direct hover
      if (hoveredRegion && countryRegion === hoveredRegion) return 'rgba(80, 80, 80, 0.5)'; // Highlight for region hover
      return 'rgba(255, 255, 255, 0.05)'; // Default transparent top  used to be 0.03
    }

    // Default regional highlighting (when no height filter)
    if (country === hoverD) return 'rgba(255, 255, 255, 0.5)';
    if (hoveredRegion && countryRegion === hoveredRegion) return 'rgba(80, 80, 80, 0.5)';

    return 'rgba(0, 0, 0, 0)'; // No color
  }, [hoverD, heightFilter, playerCountries, teamColors, getCountryRegion]);

  const getSideColor = useCallback((country) => {
    if (country.__layer === 'surface') return 'transparent';

    const hoveredRegion = hoverD ? getCountryRegion(hoverD) : null;
    const countryRegion = getCountryRegion(country);

    if (heightFilter !== 'none') {
      if (country === hoverD) return 'rgba(255, 255, 255, 0.7)'; // Brightest for direct hover
      if (hoveredRegion && countryRegion === hoveredRegion) return 'rgba(255, 255, 255, 0.5)'; // Brighter for region hover
      return 'rgba(255, 255, 255, 0.05)'; // Default transparent for all others  used to be 0.03
    }

    // No height filter — default hover/region logic
    if (country === hoverD) return 'rgba(255, 255, 255, 1)';
    if (hoveredRegion && countryRegion === hoveredRegion) return 'rgba(255, 255, 255, 1)';

    return 'rgba(0, 0, 0, 0)';
  }, [hoverD, heightFilter, getCountryRegion]);

  // Optimized stroke and side color functions
  const getStrokeColor = useCallback((country) =>
    country.__layer === 'surface' ? '#000000' : '#666666',
    []
  );

  // Auto-select a random available country
  const autoSelectCountry = useCallback(() => {
    if (!onCountrySelect || gamePhase !== 'country_selection') return;
    const allCodes = countries.features
      .map(f => getCountryCode(f))
      .filter(code => code && code !== '-99' && !EXCLUDED_COUNTRIES.has(code));
    const taken = new Set(Object.values(playerCountries).flat());
    const available = allCodes.filter(code => !taken.has(code));
    if (available.length > 0) {
      onCountrySelect(available[Math.floor(Math.random() * available.length)]);
    }
  }, [countries, playerCountries, onCountrySelect, gamePhase]);

  // Keep a stable ref so the timeout closure is never stale
  useEffect(() => { autoSelectRef.current = autoSelectCountry; }, [autoSelectCountry]);

  // WAAPI animation — loops via timerCycle; auto-selects on expiry if player hasn't picked
  useEffect(() => {
    if (gamePhase !== 'country_selection') return;
    const el = timerFillRef.current;
    if (!el) return;
    el.getAnimations().forEach(a => a.cancel());
    let cancelled = false;
    const anim = el.animate(
      [
        { clipPath: 'inset(0 0% 0 0)' },
        { clipPath: 'inset(0 100% 0 0)' }
      ],
      { duration: timerDuration * 1000, fill: 'forwards', easing: 'linear', composite: 'replace' }
    );
    anim.onfinish = () => {
      if (cancelled) return;
      autoSelectRef.current?.();
      setTimerCycle(c => c + 1);
    };
    return () => { cancelled = true; anim.cancel(); };
  }, [currentPlayer, timerDuration, gamePhase, timerCycle]);

  // Reset bidding state when entering bidding phase
  useEffect(() => {
    if (gamePhase === 'bidding') {
      setBiddingCurrentBidderIdx(0);
      setBiddingHighBid(null);
      setBiddingConsecPasses(0);
      setBiddingWinner(null);
      setBiddingLog([]);
      setBiddingBidCount(0);
      setMyBidAmount(1);
      setMyBidCategory('gdp');
      setBiddingTimerCycle(0);
    }
  }, [gamePhase]);

  // Bidding timer WAAPI — fires auto-pass on expiry
  const handleBiddingPass = useCallback(() => {
    const teamIds = Object.keys(teamColors);
    const numTeams = teamIds.length;
    const newPasses = biddingConsecPasses + 1;
    setBiddingLog(prev => [...prev, { teamIdx: biddingCurrentBidderIdx, type: 'pass' }]);
    if (biddingHighBid !== null && newPasses >= numTeams - 1) {
      const winner = biddingHighBid;
      setBiddingWinner(winner);
      setCurrentMode(winner.category);
      setBiddingLog(prev => [...prev, { teamIdx: winner.teamIdx, type: 'win', amount: winner.amount, category: winner.category }]);
    } else if (biddingHighBid === null && newPasses >= numTeams) {
      setBiddingWinner({ teamIdx: -1, amount: 0, category: '' });
      setBiddingLog(prev => [...prev, { teamIdx: -1, type: 'nowin' }]);
    } else {
      setBiddingConsecPasses(newPasses);
      setBiddingCurrentBidderIdx(prev => (prev + 1) % numTeams);
      setBiddingTimerCycle(c => c + 1);
    }
  }, [teamColors, biddingConsecPasses, biddingHighBid, biddingCurrentBidderIdx]);

  const handleBiddingBid = useCallback(() => {
    const teamIds = Object.keys(teamColors);
    const numTeams = teamIds.length;
    const minBid = biddingHighBid ? biddingHighBid.amount + 1 : 1;
    const amount = Math.max(myBidAmount, minBid);
    setBiddingHighBid({ teamIdx: biddingCurrentBidderIdx, amount, category: myBidCategory });
    setBiddingLog(prev => [...prev, { teamIdx: biddingCurrentBidderIdx, type: 'bid', amount, category: myBidCategory, eclipseRegion: myEclipseRegion }]);
    setEclipseRegion(myEclipseRegion);
    setBiddingBidCount(c => c + 1);
    setBiddingConsecPasses(0);
    setBiddingCurrentBidderIdx(prev => (prev + 1) % numTeams);
    setMyBidAmount(amount + 1);
    setBiddingTimerCycle(c => c + 1);
  }, [teamColors, biddingCurrentBidderIdx, biddingHighBid, myBidAmount, myBidCategory, myEclipseRegion]);

  const getCountryValue = useCallback((code) => {
    const feat = countries.features.find(f => getCountryCode(f) === code);
    if (!feat) return 0;
    const dataset = AVAILABLE_DATASETS[currentMode];
    return dataset ? dataset.getter(feat) : 0;
  }, [countries.features, currentMode]);

  const formatCountryValue = useCallback((feat) => {
    if (!feat) return null;
    const dataset = AVAILABLE_DATASETS[currentMode];
    if (!dataset) return null;
    const val = dataset.getter(feat);
    return val ? (dataset.format ? dataset.format(val) : String(val)) : null;
  }, [currentMode]);

  // playedCards: { playerIdx: countryCode } — 1 card per team per round
  const resolvePlayCard = useCallback((countryCode, currentPlayed, clickEvent) => {
    if (clickEvent) playCardClickPosRef.current = { x: clickEvent.clientX, y: clickEvent.clientY };
    setAnimatingPlayCode(countryCode);
    const numTeams = Object.keys(teamColors).length;
    const newPlayed = { ...currentPlayed, [playCurrentPlayer]: countryCode };
    setPlayedCards(newPlayed);
    setPlayTimerCycle(c => c + 1);
    if (Object.keys(newPlayed).length === numTeams) {
      const areaGetter = AVAILABLE_DATASETS['area']?.getter;
      const eclipseSet = eclipseEnabled ? (ECLIPSE_REGION_COUNTRIES[eclipseRegion] ?? null) : null;
      const inRegion = eclipseSet
        ? Object.entries(newPlayed).filter(([, code]) => eclipseSet.has(code))
        : [];
      let winnerIdx;
      if (inRegion.length === 1) {
        winnerIdx = Number(inRegion[0][0]);
      } else {
        winnerIdx = 0;
        let winnerVal = -Infinity;
        let winnerArea = -Infinity;
        Object.entries(newPlayed).forEach(([idxStr, code]) => {
          const val = getCountryValue(code);
          const feat = countries.features.find(f => getCountryCode(f) === code);
          const area = (areaGetter && feat) ? areaGetter(feat) : 0;
          if (val > winnerVal || (val === winnerVal && area > winnerArea)) {
            winnerVal = val; winnerArea = area; winnerIdx = Number(idxStr);
          }
        });
      }
      setPlayRoundWinner(winnerIdx);
      const teamIds = Object.keys(teamColors);
      setHandsWon(prev => ({ ...prev, [teamIds[winnerIdx]]: (prev[teamIds[winnerIdx]] || 0) + 1 }));
    } else {
      setPlayCurrentPlayer(prev => (prev + 1) % numTeams);
    }
  }, [teamColors, playCurrentPlayer, getCountryValue, eclipseEnabled, eclipseRegion]);

  const handlePlayCard = useCallback((countryCode, clickEvent) => {
    if (gamePhase !== 'play') return;
    if (viewedPlayer !== playCurrentPlayer) return;
    if (playedCards[playCurrentPlayer] !== undefined) return;
    resolvePlayCard(countryCode, playedCards, clickEvent);
  }, [gamePhase, viewedPlayer, playCurrentPlayer, playedCards, resolvePlayCard]);

  const autoPlayCardRef = useRef(null);
  const autoPlayCard = useCallback(() => {
    const playerKey = `player${playCurrentPlayer + 1}`;
    const alreadyPlayed = new Set(Object.values(playedCards));
    const available = (playerCountries[playerKey] || []).filter(c => !alreadyPlayed.has(c));
    if (!available.length) return;
    resolvePlayCard(available[Math.floor(Math.random() * available.length)], playedCards, null);
  }, [playCurrentPlayer, playedCards, playerCountries, resolvePlayCard]);
  useEffect(() => { autoPlayCardRef.current = autoPlayCard; }, [autoPlayCard]);

  // "Next Round" within play phase — consume this round's cards, advance round counter
  const [playRoundsCompleted, setPlayRoundsCompleted] = useState(0);

  const resetPlayRoundRef = useRef(null);
  const resetPlayRound = useCallback(() => {
    if (onConsumePlayedCards) onConsumePlayedCards(playedCards);
    setPlayRoundsCompleted(prev => {
      const next = prev + 1;
      if (next >= cardsToPlay) {
        const bidWinner = biddingWinnerRef.current;
        if (bidWinner?.teamIdx >= 0) {
          const teamIds = Object.keys(teamColors);
          const winnerId = teamIds[bidWinner.teamIdx];
          setHandsWon(currentHandsWon => {
            if (winnerId && (currentHandsWon[winnerId] || 0) < bidWinner.amount) {
              setBidPenalties(p => ({ ...p, [winnerId]: (p[winnerId] || 0) + bidPenaltyAmount }));
            }
            return currentHandsWon;
          });
        }
        setTimeout(() => onPhaseChange?.('game_over'), 1500);
      }
      return next;
    });
    setPlayedCards({});
    setPlayRoundWinner(null);
    setPlayCurrentPlayer(0);
    setPlayCountdown(null);
    setPlayTimerCycle(c => c + 1);
  }, [onConsumePlayedCards, playedCards, cardsToPlay, teamColors, bidPenaltyAmount]);
  useEffect(() => { resetPlayRoundRef.current = resetPlayRound; }, [resetPlayRound]);

  useEffect(() => {
    if (gamePhase === 'play') {
      setPlayedCards({});
      setPlayRoundWinner(null);
      const winner = biddingWinnerRef.current;
      setPlayCurrentPlayer(winner?.teamIdx >= 0 ? winner.teamIdx : 0);
      setPlayRoundsCompleted(0);
      setPlayCountdown(null);
      setPlayTimerCycle(c => c + 1);
    }
  }, [gamePhase]);

  // Countdown after round winner set — 5s then auto-advance
  useEffect(() => {
    if (playRoundWinner === null) return;
    setPlayCountdown(5);
    const interval = setInterval(() => {
      setPlayCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          resetPlayRoundRef.current?.();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [playRoundWinner]);

  useEffect(() => { biddingWinnerRef.current = biddingWinner; }, [biddingWinner]);

  // Auto-countdown from bidding end to play phase
  useEffect(() => {
    if (biddingWinner === null) return;
    setBiddingEndCountdown(3);
    const interval = setInterval(() => {
      setBiddingEndCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onPhaseChange?.('play');
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [biddingWinner]);

  const biddingPassRef = useRef(null);
  useEffect(() => { biddingPassRef.current = handleBiddingPass; }, [handleBiddingPass]);

  useEffect(() => {
    if (gamePhase !== 'bidding' || biddingWinner !== null) return;
    const el = timerFillRef.current;
    if (!el) return;
    el.getAnimations().forEach(a => a.cancel());
    let cancelled = false;
    const anim = el.animate(
      [{ clipPath: 'inset(0 0% 0 0)' }, { clipPath: 'inset(0 100% 0 0)' }],
      { duration: biddingTimerDuration * 1000, fill: 'forwards', easing: 'linear', composite: 'replace' }
    );
    anim.onfinish = () => {
      if (cancelled) return;
      biddingPassRef.current?.();
      setBiddingTimerCycle(c => c + 1);
    };
    return () => { cancelled = true; anim.cancel(); };
  }, [biddingCurrentBidderIdx, biddingTimerDuration, gamePhase, biddingTimerCycle, biddingWinner]);

  // Play phase timer — auto-plays random card on expiry
  useEffect(() => {
    if (gamePhase !== 'play' || playRoundWinner !== null) return;
    const el = timerFillRef.current;
    if (!el) return;
    el.getAnimations().forEach(a => a.cancel());
    let cancelled = false;
    const anim = el.animate(
      [{ clipPath: 'inset(0 0% 0 0)' }, { clipPath: 'inset(0 100% 0 0)' }],
      { duration: playTimerDuration * 1000, fill: 'forwards', easing: 'linear', composite: 'replace' }
    );
    anim.onfinish = () => {
      if (cancelled) return;
      autoPlayCardRef.current?.();
    };
    return () => { cancelled = true; anim.cancel(); };
  }, [playCurrentPlayer, playTimerDuration, gamePhase, playTimerCycle, playRoundWinner]);

  // Optimized country click handler
  const handleCountryClick = useCallback((country, event) => {
    if (!onCountrySelect || gamePhase !== 'country_selection' || country.__layer !== 'elevated') {
      return;
    }
    if (viewedPlayer !== currentPlayer) return;

    const countryCode = getCountryCode(country);
    if (!countryCode || countryCode === '-99') return;

    const isAlreadySelected = Object.values(playerCountries)
      .some(playerCountryList => playerCountryList.includes(countryCode));

    if (!isAlreadySelected) {
      if (event) clickPosRef.current = { x: event.clientX, y: event.clientY };
      onCountrySelect(countryCode);
    }
  }, [onCountrySelect, gamePhase, playerCountries, viewedPlayer, currentPlayer]);

  // Optimized hover handler
  const handlePolygonHover = useCallback((country) => {
    if (!country || country.__layer === 'elevated') {
      setHoverD(country);
    }
  }, []);

  // Memoized label generator
  const getPolygonLabel = useCallback(({ properties: d, __layer }) => {
    if (__layer === 'surface') return '';

    const name = d.NAME || d.ADMIN || 'Unknown';
    const code = getCountryCode({ properties: d });
    const region = REGION_MAPPING[code] || 'n/a';

    // Generate data rows for ALL selected datasets (not limited to 6)
    const dataRows = selectedDatasets.map(datasetId => {
      const dataset = AVAILABLE_DATASETS[datasetId];
      if (!dataset) return '';

      // Handle disabled datasets
      if (dataset.disabled) {
        const displayName = dataset.name.length > 20
          ? dataset.name.substring(0, 17) + '...'
          : dataset.name;
        return `<div style="font-size: 10px; margin: 1px 0; color: #ff6b6b; text-decoration: line-through; text-align: center;">❌ ${displayName}: Disabled</div>`;
      }

      try {
        const value = dataset.getter({ properties: d });
        const formattedValue = dataset.format(value);

        // Use a shorter version of the name for display
        const displayName = dataset.name.length > 20
          ? dataset.name.substring(0, 17) + '...'
          : dataset.name;

        // Check if value is 0 or very low and mark as potentially problematic
        // neighbors legitimately returns 0 for island nations — don't flag it
        if (datasetId !== 'neighbors' && (value === 0 || (typeof value === 'number' && value < 0.001))) {
          return `<div style="font-size: 10px; margin: 1px 0; text-align: center;"><span style="color: #CD5C5C;">${displayName}:</span> <span style="color: white;">${formattedValue}</span></div>`;
        }

        return `<div style="font-size: 10px; margin: 1px 0; text-align: center;"><span style="color: #666666;">${displayName}:</span> <span style="color: white;">${formattedValue}</span></div>`;
      } catch (error) {
        console.warn(`Error getting data for ${datasetId}:`, error);
        return `<div style="font-size: 10px; margin: 1px 0; color: #ff6b6b; text-align: center;">${dataset.name}: Error</div>`;
      }
    }).filter(row => row !== '').join('');

    // Calculate optimal dimensions based on content
    const titleHeight = 20;
    const regionHeight = 16;
    const rowHeight = 14;
    const padding = 32; // Total vertical padding
    const minContentHeight = titleHeight + regionHeight + padding;
    const contentHeight = selectedDatasets.length * rowHeight;
    const totalHeight = Math.max(minContentHeight + contentHeight, 140);

    // Hexagon should maintain perfect equilateral proportions
    // For the CSS hexagon clip-path to look equilateral, width should be slightly larger than height
    // Based on the original working ratio of ~0.87, but allowing unlimited scaling
    const width = totalHeight * 1.15;

    return `
      <div style="
        background: transparent;
        color: white;
        position: relative;
        width: ${width}px;
        height: ${totalHeight}px;
        padding: 16px 20px;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        line-height: 1.3;
        overflow: visible;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
      ">
        <div style="
          position: absolute;
          top: -2px;
          left: -2px;
          width: calc(100% + 4px);
          height: calc(100% + 4px);
          background: white;
          clip-path: polygon(50% 0%, 86.6% 25%, 86.6% 75%, 50% 100%, 13.4% 75%, 13.4% 25%);
          z-index: -2;
        "></div>
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: #252525;
          clip-path: polygon(50% 0%, 86.6% 25%, 86.6% 75%, 50% 100%, 13.4% 75%, 13.4% 25%);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          z-index: -1;
        "></div>
        <div style="
          font-weight: bold; 
          font-size: 13px; 
          margin-bottom: 10px;
          color: #ffffff;
          text-align: center;
          flex-shrink: 0;
        ">
          ${name} (${code})
        </div>
        <div style="
          font-size: 10px;
          line-height: 1.4;
          text-align: center;
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          width: 100%;
          overflow: visible;
        ">
          ${dataRows}
        </div>
        <div style="
          font-size: 8px; 
          margin-top: 8px; 
          opacity: 0.7; 
          text-align: center;
          font-style: italic;
          flex-shrink: 0;
        ">
          ${region.replace(/_/g, ' ')}
        </div>
      </div>
    `;
  }, [selectedDatasets]);

  // Height filter buttons data - now dynamic based on selected datasets
  const heightFilterButtons = useMemo(() =>
    selectedDatasets.map(datasetId => ({
      key: datasetId,
      label: AVAILABLE_DATASETS[datasetId]?.name?.split(' ')[0] || datasetId
    })),
    [selectedDatasets]
  );

  // Alliance state: key = 'senderIdx-receiverIdx', value = true/false
  const [alliancesSent, setAlliancesSent] = useState({});
  // Display state for "Alliance Sent!" fade animation: same key format
  const [allianceDisplayStates, setAllianceDisplayStates] = useState({});
  // Alliance penalties: playerId → cumulative penalty points
  const [alliancePenalties, setAlliancePenalties] = useState({});
  // Bid penalties: playerId → penalty points (applied when bid winner misses their bid)
  const [bidPenalties, setBidPenalties] = useState({});
  // Region completion notifications: [{ id, text }]
  const [regionNotifications, setRegionNotifications] = useState([]);
  const prevCompletedRegionsRef = useRef(new Set());

  // allianceKey: from viewedPlayer → targetIdx, or targetIdx → viewedPlayer
  const allianceKey = (fromIdx, toIdx) => `${fromIdx}-${toIdx}`;

  const handleAllianceAction = (targetIdx, action) => {
    const teamIds = Object.keys(teamColors);
    const key = allianceKey(viewedPlayer, targetIdx);
    const reverseKey = allianceKey(targetIdx, viewedPlayer);
    if (action === 'send') {
      setAlliancesSent(prev => ({ ...prev, [key]: true }));
      setAllianceDisplayStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setAllianceDisplayStates(prev => ({ ...prev, [key]: false })), 5000);
    } else if (action === 'rescind') {
      setAlliancesSent(prev => ({ ...prev, [key]: false }));
      setAllianceDisplayStates(prev => ({ ...prev, [key]: false }));
    } else if (action === 'accept') {
      setAlliancesSent(prev => ({ ...prev, [key]: true, [reverseKey]: true }));
      setAllianceDisplayStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setAllianceDisplayStates(prev => ({ ...prev, [key]: false })), 5000);
      const myId = teamIds[viewedPlayer];
      const theirId = teamIds[targetIdx];
      setAlliancePenalties(prev => ({
        ...prev,
        [myId]: (prev[myId] || 0) + alliancePenaltyAmount,
        [theirId]: (prev[theirId] || 0) + alliancePenaltyAmount,
      }));
    } else if (action === 'break') {
      setAlliancesSent(prev => ({ ...prev, [key]: false, [reverseKey]: false }));
      setAllianceDisplayStates(prev => ({ ...prev, [key]: false, [reverseKey]: false }));
      const teamIds = Object.keys(teamColors);
      const myId = teamIds[viewedPlayer];
      const theirId = teamIds[targetIdx];
      setAlliancePenalties(prev => ({
        ...prev,
        [myId]: (prev[myId] || 0) + 10,
        [theirId]: (prev[theirId] || 0) + 10,
      }));
    }
  };

  // Detect newly completed regions when claimedCountries changes
  useEffect(() => {
    const teamIds = Object.keys(teamColors);
    const getAlliedOwnedForEffect = (playerId) => {
      const myIdx = teamIds.indexOf(playerId);
      const owned = new Set(claimedCountries[playerId] || []);
      teamIds.forEach((id, theirIdx) => {
        if (theirIdx === myIdx) return;
        if (alliancesSent[`${myIdx}-${theirIdx}`] && alliancesSent[`${theirIdx}-${myIdx}`]) {
          (claimedCountries[id] || []).forEach(c => owned.add(c));
        }
      });
      return owned;
    };
    const nowComplete = new Set();
    Object.entries(REGIONS).forEach(([regionKey, list]) => {
      const valid = list.filter(c => !EXCLUDED_COUNTRIES.has(c));
      if (valid.length === 0) return;
      const completedBy = teamIds.find(id => {
        const owned = getAlliedOwnedForEffect(id);
        return valid.every(c => owned.has(c));
      });
      if (completedBy) nowComplete.add(regionKey);
    });
    const newlyDone = [...nowComplete].filter(k => !prevCompletedRegionsRef.current.has(k));
    if (newlyDone.length > 0) {
      const newNotifs = newlyDone.map(k => ({
        id: `${k}-${Date.now()}`,
        text: `${REGION_DISPLAY_NAMES[k] || k} was completed!`,
      }));
      setRegionNotifications(prev => [...prev, ...newNotifs]);
      newNotifs.forEach(n => {
        setTimeout(() => setRegionNotifications(prev => prev.filter(x => x.id !== n.id)), 8000);
      });
    }
    prevCompletedRegionsRef.current = nowComplete;
  }, [claimedCountries, alliancesSent, teamColors]);

  // Returns combined CLAIMED-country set for a player + all mutual allies
  const getAlliedOwned = (playerId) => {
    const teamIds = Object.keys(teamColors);
    const myIdx = teamIds.indexOf(playerId);
    const owned = new Set(claimedCountries[playerId] || []);
    teamIds.forEach((id, theirIdx) => {
      if (theirIdx === myIdx) return;
      if (alliancesSent[`${myIdx}-${theirIdx}`] && alliancesSent[`${theirIdx}-${myIdx}`]) {
        (claimedCountries[id] || []).forEach(c => owned.add(c));
      }
    });
    return owned;
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '600px' }}>
      <Globe
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        lineHoverPrecision={0}
        enablePointerInteraction={true}
        controls={true}

        polygonsData={polygonData}
        polygonAltitude={getPolygonHeight}
        polygonCapColor={getCountryColor}
        polygonSideColor={getSideColor}
        polygonStrokeColor={getStrokeColor}
        polygonLabel={getPolygonLabel}
        onPolygonHover={handlePolygonHover}
        onPolygonClick={handleCountryClick}
        polygonsTransitionDuration={300}

        // Region boundary lines
        pathsData={regionBoundaries}
        pathPoints={(d) => d.coordinates}
        pathPointLat={(point) => point[1]}
        pathPointLng={(point) => point[0]}
        pathColor={() => '#FFFFFF'}
        pathStroke={2}
        pathDashLength={0}
        pathDashGap={0}
        pathAltitude={0.015}
        pathResolution={2}
        pathTransitionDuration={0}

        // Team color (winner's color in game_over, otherwise viewed player's color)
        atmosphereColor={(() => {
          if (gamePhase === 'game_over') {
            const teamIds = Object.keys(teamColors);
            const hw = handsWon;
            const maxHW = Math.max(0, ...teamIds.map(id => hw[id] || 0));
            const getAtmCR = (id) => {
              const owned = getAlliedOwned(id);
              let cr = 0;
              Object.values(REGIONS).forEach(list => {
                const valid = list.filter(c => !EXCLUDED_COUNTRIES.has(c));
                if (valid.length > 0 && valid.every(c => owned.has(c))) cr += valid.length;
              });
              return cr;
            };
            const maxCR = Math.max(0, ...teamIds.map(getAtmCR));
            let bestId = teamIds[0], bestTotal = -Infinity;
            teamIds.forEach(id => {
              const hw2 = handsWon[id] || 0;
              const cr2 = getAtmCR(id);
              const hws = maxHW > 0 ? Math.round((hw2 / maxHW) * 100) : 0;
              const us = maxCR > 0 ? Math.round((cr2 / maxCR) * 100) : 0;
              const total = hws + us - (alliancePenalties[id] || 0) - (bidPenalties[id] || 0);
              if (total > bestTotal) { bestTotal = total; bestId = id; }
            });
            return teamColors[bestId] || 'cyan';
          }
          return Object.values(teamColors)[viewedPlayer] || 'cyan';
        })()}
        atmosphereAltitude={0.5}
      />

      {/* Top row: Phase | Timebar | Leaderboard */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        right: '10px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        zIndex: 100,
        pointerEvents: 'none'
      }}>

        {/* Phase image + label */}
        <div style={{
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '8px',
          flexShrink: 0
        }}>
          <img
            src="/phase.png"
            alt="Phase"
            style={{ width: '22px', height: '22px', objectFit: 'contain' }}
          />
          <div style={{ color: 'white', fontSize: '11px', fontWeight: 'normal' }}>
            {gamePhase === 'country_selection' ? 'Selection' :
             gamePhase === 'bidding' ? 'Bidding' :
             gamePhase === 'planning' ? 'Planning' :
             gamePhase === 'play' ? 'Play' : 'Game Over'}
          </div>
        </div>

        {/* Timebar — WAAPI off-main-thread, gradient fixed, grey when viewing other team */}
        <div style={{
          flex: 1,
          height: '5px',
          borderRadius: '3px',
          alignSelf: 'flex-start',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div
            ref={timerFillRef}
            style={{
              width: '100%',
              height: '100%',
              background: viewedPlayer !== (gamePhase === 'bidding' ? biddingCurrentBidderIdx : gamePhase === 'play' ? playCurrentPlayer : currentPlayer)
                ? 'rgba(180,180,180,0.45)'
                : 'linear-gradient(90deg, white, #FF80FF, #0000FF, #80FFFF, white)',
              willChange: 'clip-path',
              transform: 'translateZ(0)'
            }}
          />
        </div>

        {/* Region notifications + Leaderboard */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexShrink: 0, pointerEvents: 'none' }}>
          {/* Region completion notifications (left of leaderboard) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', paddingTop: '4px' }}>
            {regionNotifications.map(n => (
              <div key={n.id} style={{
                color: 'white', fontSize: '13px', fontWeight: 'normal',
                whiteSpace: 'nowrap', pointerEvents: 'none',
                animation: 'fade-in 0.3s ease forwards',
              }}>
                {n.text}
              </div>
            ))}
          </div>

          {/* Leaderboard — double-click opens scoreboard */}
          <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0px',
            flexShrink: 0
          }}
          onDoubleClick={() => setShowScoreboard(true)}
        >
          {Object.entries(teamColors).map(([playerId, color], idx) => {
            const score = (playerCountries[playerId] || []).length;
            const isActive = viewedPlayer === idx;
            const label = idx + 1;
            return (
              <div
                key={playerId}
                onClick={() => onViewedPlayerChange && onViewedPlayerChange(idx)}
                style={{
                  backgroundColor: color,
                  width: '62px',
                  height: '34px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 7px',
                  cursor: 'pointer',
                  outline: isActive ? '2px solid white' : 'none',
                  outlineOffset: '-2px',
                  userSelect: 'none'
                }}
              >
                <span style={{ color: 'white', fontSize: '15px', fontWeight: 'normal', lineHeight: 1, textShadow: '1px 1px 0px rgba(0,0,0,0.4)' }}>{label}</span>
                <span style={{
                  color: 'white',
                  fontSize: '17px',
                  fontWeight: 'bold',
                  marginLeft: 'auto',
                  lineHeight: 1,
                  textShadow: '1px 1px 0px rgba(0,0,0,0.4)'
                }}>{score}</span>
              </div>
            );
          })}
          </div>
        </div>

      </div>

      {/* Left Panel Container - Mode Selector */}
      <div style={{
        position: 'absolute',
        top: '140px',
        left: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0px',
        zIndex: 100
      }}>
        {/* Mode Selector Panel */}
        <div style={{
          width: '380px',
          backgroundColor: 'black',
          border: '1px solid white'
        }}>
          {/* Team Logos Header */}
          <div style={{
            backgroundColor: '#252525',
            color: 'white',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '15px',
            fontWeight: 'normal',
            borderBottom: '1px solid white',
            gap: '20px'
          }}>
            {Object.entries(teamColors).map(([id, color], idx) => {
              const activeIdx = gamePhase === 'bidding' ? biddingCurrentBidderIdx :
                                gamePhase === 'country_selection' ? currentPlayer :
                                gamePhase === 'play' ? playCurrentPlayer : -1;
              const isActive = idx === activeIdx;
              return (
                <span key={id} style={{
                  color: isActive ? color : '#555',
                  textShadow: isActive ? '0 0 8px rgba(255,255,255,0.9), 0 0 3px white' : 'none',
                  transition: 'color 0.2s, text-shadow 0.2s'
                }}>{idx + 1}</span>
              );
            })}
          </div>

          {/* Mode Selection Content */}
          <div style={{
            backgroundColor: '#252525',
            color: 'white',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            fontSize: '13px',
            fontWeight: 'normal',
          }}>
            {[
              { label: 'mode', value: currentMode, show: true },
              { label: 'eclipse', value: eclipseRegion, show: eclipseEnabled },
              { label: 'round', value: '1/1', show: true },
              { label: 'bid', value: `⚔ 0/${biddingBidCount}`, show: true },
            ].filter(item => item.show).map(item => (
              <div key={item.label} style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                <span style={{ color: '#888888' }}>{item.label}</span>
                <span style={{ color: 'white' }}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* Bidding Section — only visible in bidding phase */}
          {gamePhase === 'bidding' && (() => {
            const bidderIdx = biddingCurrentBidderIdx;
            const bidderColor = Object.values(teamColors)[bidderIdx] || '#fff';
            const bidderName = getTeamColorName(bidderColor);
            const isAuctionOver = biddingWinner !== null;
            const minBid = biddingHighBid ? biddingHighBid.amount + 1 : 1;
            const effectiveAmount = Math.max(myBidAmount, minBid);
            const canBid = !biddingHighBid || effectiveAmount > biddingHighBid.amount;

            return (
              <div style={{ borderTop: '1px solid white', backgroundColor: '#1a1a1a' }}>
                {/* Bid log */}
                <div style={{
                  maxHeight: '90px', overflowY: 'auto', padding: '6px 14px 4px',
                  display: 'flex', flexDirection: 'column', gap: '2px',
                }}>
                  {biddingLog.length === 0 && (
                    <div style={{ fontSize: '13px', color: '#999' }}>Bidding starts...</div>
                  )}
                  {biddingLog.map((entry, i) => {
                    const ec = Object.values(teamColors)[entry.teamIdx] || '#ccc';
                    const en = entry.teamIdx >= 0 ? getTeamColorName(ec) : '';
                    if (entry.type === 'bid') return (
                      <div key={i} style={{ fontSize: '13px', color: '#ccc' }}>
                        <span style={{ color: ec }}>{en}</span> bids {entry.amount} for {entry.category.toUpperCase()}{eclipseEnabled && entry.eclipseRegion ? ` and eclipse on ${entry.eclipseRegion}` : ''}
                      </div>
                    );
                    if (entry.type === 'pass') return (
                      <div key={i} style={{ fontSize: '13px', color: '#bbb' }}>
                        <span style={{ color: ec }}>{en}</span> passes
                      </div>
                    );
                    if (entry.type === 'win') return (
                      <div key={i} style={{ fontSize: '13px', color: '#ccc' }}>
                        <span style={{ color: ec }}>{en}</span> must win {entry.amount} {entry.category.toUpperCase()} {entry.amount === 1 ? 'hand' : 'hands'}
                      </div>
                    );
                    if (entry.type === 'nowin') return (
                      <div key={i} style={{ fontSize: '13px', color: '#999' }}>No bid — round passed</div>
                    );
                    return null;
                  })}
                </div>

                {/* Bid form / status */}
                {isAuctionOver ? (
                  <div style={{ padding: '3px 14px', borderTop: '1px solid rgba(255,255,255,0.15)', backgroundColor: '#1a1a1a', textAlign: 'center', fontSize: '13px', color: '#aaa' }}>
                    {biddingEndCountdown != null
                      ? <span>starting play in <span style={{ color: 'white', fontWeight: 'bold' }}>{biddingEndCountdown}</span>...</span>
                      : <span>transitioning...</span>}
                  </div>
                ) : viewedPlayer === bidderIdx ? (
                  <div style={{ padding: '6px 14px 10px', display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.15)', backgroundColor: '#1a1a1a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'white' }}>
                      <span style={{ color: bidderColor }}>{bidderName}</span>
                      <span style={{ color: '#aaa' }}>bids</span>
                      <select
                        value={effectiveAmount}
                        onChange={e => setMyBidAmount(Number(e.target.value))}
                        style={{ background: '#2a2a2a', color: 'white', border: '1px solid #555', borderRadius: '3px', padding: '1px 4px', fontSize: '13px' }}
                      >
                        {Array.from({ length: Math.max(1, 14 - minBid) }, (_, i) => i + minBid).map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <span style={{ color: '#aaa' }}>for</span>
                      <select
                        value={myBidCategory}
                        onChange={e => setMyBidCategory(e.target.value)}
                        style={{ background: '#2a2a2a', color: 'white', border: '1px solid #555', borderRadius: '3px', padding: '1px 4px', fontSize: '13px' }}
                      >
                        {BID_CATEGORIES.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.label}</option>
                        ))}
                      </select>
                      {eclipseEnabled && (
                        <>
                          <span style={{ color: '#aaa' }}>and</span>
                          <select
                            value={myEclipseRegion}
                            onChange={e => setMyEclipseRegion(e.target.value)}
                            style={{ background: '#2a2a2a', color: 'white', border: '1px solid #555', borderRadius: '3px', padding: '1px 4px', fontSize: '13px' }}
                          >
                            {ECLIPSE_REGIONS.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={handleBiddingPass} style={{
                        flex: 1, padding: '4px 0', background: '#333', color: 'white',
                        border: '1px solid rgba(255,255,255,0.3)', borderRadius: '3px', cursor: 'pointer', fontSize: '13px'
                      }}>Pass</button>
                      <button onClick={canBid ? handleBiddingBid : undefined} style={{
                        flex: 1, padding: '4px 0',
                        background: canBid ? '#444' : '#2a2a2a',
                        color: canBid ? 'white' : '#555',
                        border: '1px solid rgba(255,255,255,0.3)', borderRadius: '3px',
                        cursor: canBid ? 'pointer' : 'not-allowed', fontSize: '13px'
                      }}>Bid {effectiveAmount}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '3px 14px', borderTop: '1px solid rgba(255,255,255,0.15)', backgroundColor: '#1a1a1a', textAlign: 'center', fontSize: '13px', color: '#aaa' }}>
                    waiting for <span style={{ color: bidderColor }}>{bidderName}</span> to bid...
                  </div>
                )}
              </div>
            );
          })()}

          {/* Play Panel */}
          {gamePhase === 'play' && (() => {
            const numTeams = Object.keys(teamColors).length;
            const allPlaced = Object.keys(playedCards).length === numTeams;
            const winnerColor = playRoundWinner !== null ? Object.values(teamColors)[playRoundWinner] : null;
            const winnerName = winnerColor ? getTeamColorName(winnerColor) : null;
            const curColor = Object.values(teamColors)[playCurrentPlayer] || '#fff';
            const curName = getTeamColorName(curColor);
            const GAP = 8;
            const colStep = HEX_COL_STEP + GAP;
            const playFeatures = Object.entries(teamColors).map(([_pid, _col], idx) => {
              const code = playedCards[idx];
              return code ? countries.features.find(f => getCountryCode(f) === code) || null : null;
            });
            const placedCount = playFeatures.filter(Boolean).length;
            const gridW = placedCount > 0 ? placedCount * colStep + HEX_W - colStep : 0;
            let placedCol = 0;
            return (
              <div style={{ borderTop: '1px solid white', backgroundColor: '#1a1a1a' }}>
                <div style={{ padding: '5px 14px', fontSize: '13px', color: 'white', borderBottom: '1px solid rgba(255,255,255,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {allPlaced && playRoundWinner !== null
                      ? <span key={playRoundWinner} style={{ color: winnerColor, fontWeight: 'bold', animation: 'fade-in 0.6s ease forwards' }}>{winnerName} wins!</span>
                      : <><span style={{ color: curColor }}>{curName}</span><span style={{ color: '#aaa' }}> to place</span></>
                    }
                  </span>
                  <span style={{ color: '#666', fontSize: '12px' }}>{playRoundsCompleted + 1}/{cardsToPlay}{numRounds > 1 ? ` · Round ${currentRound}/${numRounds}` : ''}</span>
                </div>
                {placedCount > 0 && (
                  <div style={{ padding: '8px 14px', position: 'relative', height: HEX_H + 16, width: gridW, marginLeft: Math.max(0, (352 - gridW) / 2) }}>
                    {Object.entries(teamColors).map(([playerId, _color], idx) => {
                      const feat = playFeatures[idx];
                      if (!feat) return null;
                      const codes = playedCards[idx] || [];
                      const code = codes[codes.length - 1];
                      const isAnimating = code === animatingPlayCode;
                      const left = placedCol * colStep;
                      placedCol++;
                      const card = (
                        <CountryHexCard
                          feature={feat}
                          allFeatures={countries.features}
                          clipId={`play-${idx}`}
                          onClick={() => {}}
                          modeValue={formatCountryValue(feat)}
                        />
                      );
                      return (
                        <div key={playerId} style={{ position: 'absolute', left }}>
                          {isAnimating
                            ? <FlyInCard clickPos={playCardClickPosRef.current} onDone={() => setAnimatingPlayCode(null)}>{card}</FlyInCard>
                            : card
                          }
                        </div>
                      );
                    })}
                  </div>
                )}
                {allPlaced && playRoundWinner !== null && (
                  <div style={{ padding: '4px 14px 10px' }}>
                    <button onClick={resetPlayRound} style={{
                      width: '100%', padding: '4px 0', background: '#333', color: 'white',
                      border: '1px solid rgba(255,255,255,0.3)', borderRadius: '3px', cursor: 'pointer', fontSize: '13px'
                    }}>Next Round{playCountdown != null ? ` ${playCountdown}s` : ''}</button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Lime Label, Search, and Owned Cards */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', position:'relative' }}>
          <div style={{
            color: Object.values(teamColors)[viewedPlayer] || '#00FFFF',
            fontSize: '18px',
            fontWeight: 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <span>{viewedPlayer + 1}</span> {getTeamColorName(Object.values(teamColors)[viewedPlayer] || '')}
          </div>
          <input
            type="text"
            placeholder="search country"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '260px',
              padding: '3px 8px',
              backgroundColor: '#2a2a2a',
              color: '#ccc',
              border: 'none',
              fontSize: '16px',
              textAlign: 'left',
              outline: 'none'
            }}
          />
          {/* Search results dropdown */}
          {searchResults.length > 0 && (() => {
            // Alternating 3-2-3-2 honeycomb rows; change these to reconfigure the grid
            const ROW_PATTERN = [3, 2];
            const rows = [];
            let idx = 0;
            while (idx < searchResults.length) {
              const cols = ROW_PATTERN[rows.length % ROW_PATTERN.length];
              rows.push(searchResults.slice(idx, idx + cols));
              idx += cols;
            }
            const GAP = 8; // visual gap between hex edges
            const maxCols = Math.max(...ROW_PATTERN);
            const colStep = HEX_COL_STEP + GAP;
            // Derive rowStep so diagonal-neighbor gap equals GAP (not just * 0.5)
            // tightDiag = actual center-to-center of diagonal neighbors at GAP=0
            const tightDiag = Math.sqrt((HEX_COL_STEP / 2) ** 2 + HEX_ROW_STEP ** 2);
            const rowStep = Math.round(Math.sqrt((tightDiag + GAP) ** 2 - (colStep / 2) ** 2));
            const gridW = maxCols * colStep + HEX_W - colStep;
            // Explicit height needed so negative-margin rows don't confuse overflow scroll
            const gridH = rows.length === 0 ? 0
              : HEX_H + (rows.length - 1) * (HEX_H - (HEX_H - rowStep));
            return (
              <div className="hex-scroll" style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: '4px',
                background: 'rgba(20,20,20,0.96)',
                borderRadius: '8px',
                padding: '16px 20px 20px',
                zIndex: 500,
                maxHeight: '60vh',
                overflowY: 'auto',
                overflowX: 'hidden',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                width: gridW + 40,
              }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', margin:'0 auto', width: gridW, height: gridH }}>
                  {rows.map((row, ri) => (
                    <div key={ri} style={{
                      display: 'flex',
                      flexDirection: 'row',
                      marginTop: ri === 0 ? 0 : -(HEX_H - rowStep),
                      marginLeft: ri % 2 === 1 ? colStep / 2 : 0,
                    }}>
                      {row.map((f, ci) => (
                        <div key={f.properties?.ISO_A2 || ci}
                          style={{ marginLeft: ci === 0 ? 0 : -(HEX_W - colStep) }}>
                          <CountryHexCard
                            feature={f}
                            allFeatures={countries.features}
                            clipId={`${ri}-${ci}`}
                            onClick={(e) => {
                              const code = getCountryCode(f);
                              if (!code || !onCountrySelect || gamePhase !== 'country_selection' || viewedPlayer !== currentPlayer) return;
                              const taken = Object.values(playerCountries).some(list => list.includes(code));
                              if (taken) return;
                              // Capture click position so the fly-in starts from the search card
                              if (e) clickPosRef.current = { x: e.clientX, y: e.clientY };
                              onCountrySelect(code);
                              setSearchQuery('');
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Owned countries grid — visible when search is closed, ordered by claim time */}
          {!searchQuery && (() => {
            const playerKey = `player${viewedPlayer + 1}`;
            const playedByThisPlayer = gamePhase === 'play' ? playedCards[viewedPlayer] : null;
            const ownedCodes = (playerCountries[playerKey] || []).filter(c => c !== playedByThisPlayer);
            if (!ownedCodes.length) return null;
            // Preserve claim order by mapping codes → features (not filtering features)
            const ownedFeatures = ownedCodes
              .map(code => countries.features.find(f => getCountryCode(f) === code))
              .filter(Boolean);
            if (!ownedFeatures.length) return null;

            const GAP = 8;
            const ROW_PATTERN = [3, 2];
            const colStep = HEX_COL_STEP + GAP;
            const tightDiag = Math.sqrt((HEX_COL_STEP / 2) ** 2 + HEX_ROW_STEP ** 2);
            const rowStep = Math.round(Math.sqrt((tightDiag + GAP) ** 2 - (colStep / 2) ** 2));
            const maxCols = Math.max(...ROW_PATTERN);
            const gridW = maxCols * colStep + HEX_W - colStep;
            const rows = [];
            let idx = 0;
            while (idx < ownedFeatures.length) {
              const cols = ROW_PATTERN[rows.length % ROW_PATTERN.length];
              rows.push(ownedFeatures.slice(idx, idx + cols));
              idx += cols;
            }
            const gridH = rows.length === 0 ? 0 : HEX_H + (rows.length - 1) * (HEX_H - (HEX_H - rowStep));

            return (
              <div className="hex-scroll" style={{
                marginTop: '8px',
                maxHeight: '55vh',
                overflowY: 'auto',
                overflowX: 'hidden',
                width: gridW + 40,
                direction: 'rtl',  // moves scrollbar to left side
              }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', margin:'0 auto', width: gridW, height: gridH, direction: 'ltr' }}>
                  {rows.map((row, ri) => (
                    <div key={ri} style={{
                      display:'flex', flexDirection:'row',
                      marginTop: ri === 0 ? 0 : -(HEX_H - rowStep),
                      marginLeft: ri % 2 === 1 ? colStep / 2 : 0,
                    }}>
                      {row.map((f, ci) => {
                        const code = getCountryCode(f);
                        const isNew = code === animatingCode;
                        const card = (
                          <CountryHexCard
                            feature={f}
                            allFeatures={countries.features}
                            clipId={`owned-${ri}-${ci}`}
                            onClick={gamePhase === 'play' && viewedPlayer === playCurrentPlayer && playedCards[playCurrentPlayer] === undefined
                              ? (e) => handlePlayCard(code, e)
                              : () => {}}
                            modeValue={gamePhase === 'play' ? formatCountryValue(f) : null}
                          />
                        );
                        return (
                          <div key={code || ci} style={{ marginLeft: ci === 0 ? 0 : -(HEX_W - colStep) }}>
                            {isNew
                              ? <FlyInCard clickPos={clickPosRef.current} onDone={() => setAnimatingCode(null)}>{card}</FlyInCard>
                              : card
                            }
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Bottom Left - Status Panel */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px',
        zIndex: 100
      }}>
        {currentPlayer !== undefined && gamePhase === 'country_selection' && (
          <div><strong>Current Player:</strong> {currentPlayer + 1}</div>
        )}
        {hoverD && (
          <div><strong>Region:</strong> {getCountryRegion(hoverD).replace('_', ' ')}</div>
        )}
        <div><strong>Data-Driven Boundaries:</strong> {regionBoundaries.length}</div>
        {hoverD && hoverD.properties && (
          <div style={{ fontSize: '11px', marginTop: '5px', opacity: 0.8 }}>
            <div><strong>Continent:</strong> {hoverD.properties.CONTINENT}</div>
            <div><strong>Subregion:</strong> {hoverD.properties.SUBREGION}</div>
          </div>
        )}
      </div>

      {/* Right Panel Container - ensures proper alignment */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '10px',
        zIndex: 100
      }}>

        {/* Height Filter Buttons */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '10px'
        }}>
          {heightFilterButtons.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setHeightFilter(heightFilter === key ? 'none' : key)}
              style={{
                padding: '5px 6px',
                backgroundColor: 'transparent',
                color: 'white',
                border: heightFilter === key ? '2px solid white' : '1px solid rgba(255, 255, 255, 0.5)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'normal',
                transition: 'all 0.2s ease'
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Alliance Panel with Text */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          {/* Alliance Sent feedback text per row */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', paddingTop: '35px' }}>
            {Object.entries(teamColors).map(([playerId, color], idx) => {
              if (idx === viewedPlayer) return <div key={playerId} style={{ height: '24px' }} />;
              const key = allianceKey(viewedPlayer, idx);
              const isDisplayed = !!allianceDisplayStates[key];
              return (
                <div key={playerId} style={{
                  height: '24px', display: 'flex', alignItems: 'center',
                  color: 'white', fontSize: '15px', fontWeight: 'normal',
                  opacity: isDisplayed ? 1 : 0, transition: 'opacity 0.3s ease-out',
                  pointerEvents: isDisplayed ? 'auto' : 'none'
                }}>
                  Alliance Sent!
                </div>
              );
            })}
          </div>

          {/* Alliance Panel */}
          <div style={{ width: '380px', backgroundColor: 'black', border: '1px solid white' }}>
            {/* Alliance Header */}
            <div style={{
              backgroundColor: '#252525', color: 'white', height: '24px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '15px', fontWeight: 'normal', borderBottom: '1px solid white', gap: '6px'
            }}>
              <img src="/alliance.png" alt="Alliance" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
              Alliances
            </div>

            {/* Team Rows */}
            <div style={{ padding: '9px 30px' }}>
              {Object.entries(teamColors).map(([playerId, color], idx, arr) => {
                if (idx === viewedPlayer) return null;
                const teamIds = Object.keys(teamColors);
                const isLastItem = idx === arr.length - 1 || (idx === arr.length - 2 && arr.length - 1 === viewedPlayer);
                const iSentToThem = !!alliancesSent[allianceKey(viewedPlayer, idx)];
                const theySentToMe = !!alliancesSent[allianceKey(idx, viewedPlayer)];
                const teamName = getTeamColorName(color);
                const teamNum = idx + 1;

                const isAccepted = iSentToThem && theySentToMe;
                const isPending = iSentToThem && !theySentToMe;

                let rightLabel, rightAction, rightBg, rightColor, rightCursor;
                if (isAccepted) {
                  rightLabel = 'break'; rightAction = 'break';
                  rightBg = '#333'; rightColor = '#777'; rightCursor = 'pointer';
                } else if (isPending) {
                  rightLabel = 'rescind'; rightAction = 'rescind';
                  rightBg = '#333'; rightColor = '#777'; rightCursor = 'pointer';
                } else if (theySentToMe) {
                  rightLabel = 'accept'; rightAction = 'accept';
                  rightBg = '#444'; rightColor = 'white'; rightCursor = 'pointer';
                } else {
                  rightLabel = 'send'; rightAction = 'send';
                  rightBg = '#666'; rightColor = 'white'; rightCursor = 'pointer';
                }

                const isRescind = isPending;
                return (
                  <div key={playerId} style={{
                    marginBottom: isLastItem ? '0px' : '9px', height: '24px',
                    border: '1px solid white', display: 'flex'
                  }}>
                    {isAccepted ? (
                      <>
                        <button
                          onClick={() => handleAllianceAction(idx, rightAction)}
                          style={{
                            width: '50%', height: '100%', backgroundColor: rightBg,
                            color: rightColor, border: 'none', fontSize: '15px', fontWeight: 'normal',
                            cursor: rightCursor, transition: 'all 0.2s ease',
                            borderRight: '1px solid white'
                          }}
                        >
                          {rightLabel}
                        </button>
                        <button
                          style={{
                            width: '50%', height: '100%', backgroundColor: 'black',
                            color: 'white', border: 'none', fontSize: '15px', fontWeight: 'normal',
                            cursor: 'default'
                          }}
                        >
                          <span style={{ color }}>{teamNum}</span> {teamName}
                        </button>
                      </>
                    ) : isRescind ? (
                      <>
                        <button
                          onClick={() => handleAllianceAction(idx, rightAction)}
                          style={{
                            width: '50%', height: '100%', backgroundColor: rightBg,
                            color: rightColor, border: 'none', fontSize: '15px', fontWeight: 'normal',
                            cursor: rightCursor, transition: 'all 0.2s ease',
                            borderRight: '1px solid white'
                          }}
                        >
                          {rightLabel}
                        </button>
                        <button
                          style={{
                            width: '50%', height: '100%', backgroundColor: 'black',
                            color: 'white', border: 'none', fontSize: '15px', fontWeight: 'normal',
                            cursor: 'default'
                          }}
                        >
                          <span style={{ color }}>{teamNum}</span> {teamName}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          style={{
                            width: '50%', height: '100%', backgroundColor: 'black',
                            color: 'white', border: 'none',
                            borderRight: '1px solid white', fontSize: '15px', fontWeight: 'normal',
                            cursor: 'default'
                          }}
                        >
                          <span style={{ color }}>{teamNum}</span> {teamName}
                        </button>
                        <button
                          onClick={() => handleAllianceAction(idx, rightAction)}
                          style={{
                            width: '50%', height: '100%', backgroundColor: rightBg,
                            color: rightColor, border: 'none', fontSize: '15px', fontWeight: 'normal',
                            cursor: rightCursor, transition: 'all 0.2s ease'
                          }}
                        >
                          {rightLabel}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute',
        top: '100px',
        right: '10px',
        backgroundColor: 'transparent',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px',
        zIndex: 100,
        maxWidth: '200px'
      }}>
        <div><strong>Legend:</strong></div>
        <div>Height: {heightFilter === 'none' ? 'Flat' : (AVAILABLE_DATASETS[heightFilter]?.name?.split(' ')[0] || heightFilter.toUpperCase())}</div>
        {heightFilter !== 'none' && heightStats.values.length > 0 && (
          <div style={{ fontSize: '10px', color: '#ccc', marginTop: '2px' }}>
            Range: {AVAILABLE_DATASETS[heightFilter]?.format(heightStats.min)} - {AVAILABLE_DATASETS[heightFilter]?.format(heightStats.max)}
          </div>
        )}
        {heightFilter !== 'none' && AVAILABLE_DATASETS[heightFilter] && (
          <div style={{ fontSize: '9px', color: '#aaa', marginTop: '1px' }}>
            Source: {AVAILABLE_DATASETS[heightFilter].category}
          </div>
        )}
        {Object.entries(teamColors).map(([id, color], idx) => (
          <div key={id} style={{ color }}>◾ {idx + 1} {getTeamColorName(color)} countries</div>
        ))}
        <div style={{ color: '#FFFFFF' }}>━ Data-Driven Boundaries</div>
        <div style={{ marginTop: '5px', fontSize: '11px' }}>
          <div><strong>Datasets:</strong> {selectedDatasets.length} ({dataLoading ? 'Loading...' : 'Live Data'})</div>
          <div>Hover: Region highlights</div>
          <div>Click: Select country</div>
          {heightFilter !== 'none' && (
            <div style={{ marginTop: '3px', fontStyle: 'italic' }}>
              {['gdp', 'population', 'area', 'neighbors'].includes(heightFilter)
                ? 'Linear/logarithmic scaling'
                : 'Reverse logarithmic scaling'}
            </div>
          )}
        </div>
      </div>

      {/* Game Over overlay */}
      {gamePhase === 'game_over' && (() => {
        const teamIds = Object.keys(teamColors);
        const maxHW = Math.max(0, ...teamIds.map(id => handsWon[id] || 0));
        const getRegionCount = (id) => {
          const owned = getAlliedOwned(id);
          let cr = 0;
          Object.values(REGIONS).forEach(list => {
            const valid = list.filter(c => !EXCLUDED_COUNTRIES.has(c));
            if (valid.length > 0 && valid.every(c => owned.has(c))) cr += valid.length;
          });
          return cr;
        };
        const maxCR = Math.max(0, ...teamIds.map(getRegionCount));
        const getTotal = (id) => {
          const hw = handsWon[id] || 0;
          const cr = getRegionCount(id);
          const hws = maxHW > 0 ? Math.round((hw / maxHW) * 100) : 0;
          const us = maxCR > 0 ? Math.round((cr / maxCR) * 100) : 0;
          return hws + us - (alliancePenalties[id] || 0) - (bidPenalties[id] || 0);
        };
        let winnerTotal = -Infinity;
        let runnerUpTotal = -Infinity;
        teamIds.forEach(id => {
          const t = getTotal(id);
          if (t > winnerTotal) { runnerUpTotal = winnerTotal; winnerTotal = t; }
          else if (t > runnerUpTotal) { runnerUpTotal = t; }
        });
        const tiedWinners = teamIds.filter(id => getTotal(id) === winnerTotal);
        const isTie = tiedWinners.length > 1;
        const winnerId = tiedWinners[0];
        const winnerColor = teamColors[winnerId] || 'cyan';
        const colorName = getTeamColorName(winnerColor).toUpperCase();
        const isUtterDefeat = !isTie && winnerTotal - runnerUpTotal >= 150;
        const font = { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' };
        return (
          <div style={{
            position: 'absolute', top: '20px', left: 0, right: 0, zIndex: 400,
            display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
            pointerEvents: 'none',
            animation: 'scoreboard-in 0.4s ease forwards'
          }}>
            {isTie ? (
              <div style={{ ...font, fontSize: '72px', fontWeight: 'bold', letterSpacing: '0.08em', color: 'white' }}>
                TIE{' '}
                {tiedWinners.map((id, i) => (
                  <span key={id}>
                    <span style={{ color: teamColors[id] }}>{getTeamColorName(teamColors[id]).toUpperCase()}</span>
                    {i < tiedWinners.length - 1 && <span style={{ color: 'white' }}> &amp; </span>}
                  </span>
                ))}
              </div>
            ) : isUtterDefeat ? (
              <div style={{ ...font, fontSize: '72px', fontWeight: 'bold', color: 'white', letterSpacing: '0.08em' }}>
                UTTER DEFEAT
              </div>
            ) : (
              <div style={{ ...font, fontSize: '72px', fontWeight: 'bold', letterSpacing: '0.08em', color: 'white' }}>
                VICTORY{' '}
                <span style={{ color: winnerColor }}>
                  {colorName}
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Scoreboard overlay */}
      {showScoreboard && (() => {
        const icons = ['✖', '★', '▲', '◆'];
        const cols = [
          { key: 'handsWon',                label: 'hands won' },
          { key: 'completedRegions',         label: 'countries in a completed region / continent' },
          { key: 'handsWonScore',            label: 'hands won score' },
          { key: 'unificationScore',         label: 'unification score' },
          { key: 'alliancePenalty',          label: 'alliance penalty' },
          { key: 'bidPenalty',               label: 'bid penalty' },
          { key: 'total',                    label: 'total' },
        ];
        const players = Object.entries(teamColors);
        // Compute raw stats for all players first
        const rawStats = {};
        players.forEach(([playerId]) => {
          const owned = getAlliedOwned(playerId);
          let completedRegions = 0;
          Object.values(REGIONS).forEach(list => {
            const valid = list.filter(c => !EXCLUDED_COUNTRIES.has(c));
            if (valid.length > 0 && valid.every(c => owned.has(c))) completedRegions += valid.length;
          });
          rawStats[playerId] = {
            handsWon: handsWon[playerId] || 0,
            completedRegions,
            alliancePenalty: alliancePenalties[playerId] || 0,
            bidPenalty: bidPenalties[playerId] || 0,
          };
        });
        const maxHandsWon = Math.max(...players.map(([id]) => rawStats[id].handsWon));
        const maxCompletedRegions = Math.max(...players.map(([id]) => rawStats[id].completedRegions));
        const computeStats = (playerId) => {
          const { handsWon: hw, completedRegions, alliancePenalty, bidPenalty } = rawStats[playerId];
          const handsWonScore = maxHandsWon > 0 ? Math.round((hw / maxHandsWon) * 100) : 0;
          const unificationScore = maxCompletedRegions > 0 ? Math.round((completedRegions / maxCompletedRegions) * 100) : 0;
          return { handsWon: hw, completedRegions, handsWonScore, unificationScore, alliancePenalty, bidPenalty, total: handsWonScore + unificationScore - alliancePenalty - bidPenalty };
        };
        const font = { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: '15px', fontWeight: 'normal' };
        const cell = { ...font, padding: '10px 20px', textAlign: 'center', whiteSpace: 'nowrap', color: 'white' };
        const hcell = { ...cell, padding: '10px 20px' };
        const sep = '2px solid white';
        return (
          <div
            onClick={() => setShowScoreboard(false)}
            style={{
              position: 'absolute', inset: 0, zIndex: 300,
              backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
              background: 'rgba(0,0,0,0.38)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'scoreboard-in 0.22s ease forwards'
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', background: '#000', padding: '28px 40px', boxSizing: 'border-box' }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: sep }}>
                    <th style={{ ...hcell, textAlign: 'left', width: '48px' }} />
                    {cols.map(c => <th key={c.key} style={hcell}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {players.map(([playerId, color], idx) => {
                    const stats = computeStats(playerId);
                    return (
                      <tr key={playerId} style={{ borderBottom: sep }}>
                        <td style={{ ...cell, textAlign: 'left', paddingLeft: '0' }}>
                          <span style={{ color, fontSize: '19px' }}>{icons[idx] || '●'}</span>
                        </td>
                        {cols.map(c => <td key={c.key} style={cell}>{stats[c.key]}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// Main game component
function App() {
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [gamePhase, setGamePhase] = useState('country_selection');
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [timerDuration, setTimerDuration] = useState(10);
  const [biddingTimerDuration, setBiddingTimerDuration] = useState(20);
  const [playTimerDuration, setPlayTimerDuration] = useState(20);
  const [cardsToPlay, setCardsToPlay] = useState(8);
  const [extraCards, setExtraCards] = useState(2);
  const [numRounds, setNumRounds] = useState(3);
  const [currentRound, setCurrentRound] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [eclipseEnabled, setEclipseEnabled] = useState(true);
  const [alliancePenaltyAmount, setAlliancePenaltyAmount] = useState(5);
  const [bidPenaltyAmount, setBidPenaltyAmount] = useState(20);
  const [viewedPlayer, setViewedPlayer] = useState(0);
  const [playerCountries, setPlayerCountries] = useState({
    player1: [],
    player2: [],
    player3: []
  });
  // Countries actually played as cards (used for region completion scoring)
  const [claimedCountries, setClaimedCountries] = useState({
    player1: [],
    player2: [],
    player3: []
  });

  // Dataset selection state - only include working datasets
  const [selectedDatasets, setSelectedDatasets] = useState([
    'gdp', 'population', 'area', 'neighbors',
    'forest_area', 'internet_users', 'urban_population', 'military_expenditure'
  ]);
  const [availableDatasets] = useState(AVAILABLE_DATASETS);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataStatus, setDataStatus] = useState('Initializing...');
  const [useDataDrivenRegions, setUseDataDrivenRegions] = useState(false);

  // Initialize global data on component mount
  useEffect(() => {
    const loadGlobalData = async () => {
      setDataLoading(true);
      setDataStatus('Fetching World Bank data...');

      try {
        await initializeGlobalData();
        setDataStatus('Data loaded successfully');
        setDataLoading(false);
      } catch (error) {
        console.error('Failed to load global data:', error);
        setDataStatus('Using fallback data');
        setDataLoading(false);
      }
    };

    loadGlobalData();
  }, []);

  const handleCountrySelect = useCallback((countryCode) => {
    setSelectedCountries(prev => [...prev, countryCode]);

    const playerKey = `player${currentPlayer + 1}`;
    setPlayerCountries(prev => ({
      ...prev,
      [playerKey]: [...prev[playerKey], countryCode]
    }));

    if (gamePhase === 'country_selection') {
      setCurrentPlayer(prev => (prev + 1) % 3);
    }
  }, [currentPlayer, gamePhase]);

  useEffect(() => {
    if (gamePhase !== 'country_selection') return;
    const totalPerPlayer = cardsToPlay + extraCards;
    if (totalPerPlayer > 0 && Object.values(playerCountries).every(list => list.length >= totalPerPlayer)) {
      setGamePhase('bidding');
    }
  }, [playerCountries, gamePhase, cardsToPlay, extraCards]);

  const teamColors = {
    player1: '#00FFFF',
    player2: '#FF00FF',
    player3: '#00FF00'
  };

  const resetGame = useCallback(() => {
    setSelectedCountries([]);
    setPlayerCountries({ player1: [], player2: [], player3: [] });
    setClaimedCountries({ player1: [], player2: [], player3: [] });
    setCurrentPlayer(0);
    setCurrentRound(1);
    setGamePhase('country_selection');
  }, []);

  const handlePhaseChange = useCallback((phase) => {
    if (phase === 'game_over') {
      setCurrentRound(r => {
        if (r < numRounds) {
          setSelectedCountries([]);
          setPlayerCountries({ player1: [], player2: [], player3: [] });
          setClaimedCountries({ player1: [], player2: [], player3: [] });
          setCurrentPlayer(0);
          setGamePhase('country_selection');
          return r + 1;
        }
        setGamePhase('game_over');
        return r;
      });
    } else {
      setGamePhase(phase);
    }
  }, [numRounds]);

  const handleConsumePlayedCards = useCallback((playedCards) => {
    const teamIds = ['player1', 'player2', 'player3'];
    const consumed = new Set(Object.values(playedCards));
    setPlayerCountries(prev => {
      const next = { ...prev };
      Object.entries(playedCards).forEach(([idxStr, code]) => {
        const pid = teamIds[Number(idxStr)];
        if (pid) next[pid] = (next[pid] || []).filter(c => c !== code);
      });
      return next;
    });
    setClaimedCountries(prev => {
      const next = { ...prev };
      Object.entries(playedCards).forEach(([idxStr, code]) => {
        const pid = teamIds[Number(idxStr)];
        if (pid) next[pid] = [...(next[pid] || []), code];
      });
      return next;
    });
    setSelectedCountries(prev => prev.filter(c => !consumed.has(c)));
  }, []);

  // Dataset selection handlers
  const handleDatasetSelect = useCallback((datasetId) => {
    const dataset = AVAILABLE_DATASETS[datasetId];
    if (dataset?.disabled) {
      console.warn(`Dataset ${datasetId} is disabled: ${dataset.disabledReason}`);
      return; // Don't allow selection of disabled datasets
    }

    setSelectedDatasets(prev => {
      if (prev.includes(datasetId)) {
        return prev.filter(id => id !== datasetId);
      } else {
        return [...prev, datasetId];
      }
    });
  }, []);

  const handleDatasetDeselect = useCallback((datasetId) => {
    setSelectedDatasets(prev => prev.filter(id => id !== datasetId));
  }, []);

  // Per-dataset stats for the custom dropdown visualizations.
  // Reruns when data finishes loading (globalDataCache is populated by then).
  const datasetStats = useMemo(() => {
    const mockFeats = Object.keys(COUNTRY_DATA).map(code => ({
      properties: { ISO_A2: code, ISO_A3: ISO2_TO_ISO3[code] || '' }
    }));
    const total = mockFeats.length;
    const stats = {};
    Object.values(availableDatasets).forEach(dataset => {
      if (dataset.disabled) { stats[dataset.id] = { zeroCount: total, unavailable: true, total }; return; }
      try {
        const values = mockFeats.map(f => { try { return dataset.getter(f); } catch { return 0; } });
        const zeros = values.filter(v => v === 0 || v === null || v === undefined).length;
        const nonZero = values.filter(v => v > 0).sort((a, b) => a - b);
        if (nonZero.length === 0) { stats[dataset.id] = { unavailable: true, total }; return; }
        const q = (p) => {
          const i = p * (nonZero.length - 1);
          const lo = Math.floor(i), hi = Math.ceil(i);
          return nonZero[lo] + (nonZero[hi] - nonZero[lo]) * (i - lo);
        };
        const box = { min: nonZero[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: nonZero[nonZero.length - 1] };
        // Box is "flat" when IQR is <2% of the full range — dead giveaway of fake/constant data
        const isFlat = (box.q3 - box.q1) < (box.max - box.min) * 0.02;
        stats[dataset.id] = { zeroCount: zeros, box, isFlat, total };
      } catch { stats[dataset.id] = { zeroCount: total, unavailable: true, total }; }
    });
    return stats;
  }, [availableDatasets, dataLoading]);

  // Group datasets by category, sorted by fewest zeros.
  const datasetsByCategory = useMemo(() => {
    const categories = {};
    Object.values(availableDatasets).forEach(dataset => {
      if (!categories[dataset.category]) categories[dataset.category] = [];
      categories[dataset.category].push(dataset);
    });
    Object.values(categories).forEach(list =>
      list.sort((a, b) => (datasetStats[a.id]?.zeroCount ?? Infinity) - (datasetStats[b.id]?.zeroCount ?? Infinity))
    );
    return categories;
  }, [availableDatasets, datasetStats]);

  const [datasetDropdownOpen, setDatasetDropdownOpen] = useState(false);

  return (
    <div className="App">
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          @keyframes scoreboard-in {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes fade-in {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes card-fly-in {
            from { opacity: 0; transform: scale(0.12) translate(var(--fx), var(--fy)); }
            to   { opacity: 1; transform: scale(1)    translate(0, 0); }
          }

          .hex-scroll::-webkit-scrollbar { width: 3px; }
          .hex-scroll::-webkit-scrollbar-track { background: transparent; }
          .hex-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
          .hex-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }

          /* Remove ALL default tooltip backgrounds from react-globe.gl */
          .scene-tooltip,
          .graph-tooltip,
          div[class*="tooltip"],
          div[style*="position: absolute"][style*="pointer-events: none"] {
            background: transparent !important;
            background-color: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            backdrop-filter: none !important;
          }
        `}
      </style>
      <header style={{ padding: '15px 20px', backgroundColor: '#282c34', color: 'white' }}>
        {/* Top bar with dataset selection */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '15px',
          borderBottom: '1px solid #444',
          paddingBottom: '15px'
        }}>
          {/* Dataset Selection Dropdown */}
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {/* Region Mode Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <label style={{ color: '#ccc', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={useDataDrivenRegions}
                  onChange={(e) => setUseDataDrivenRegions(e.target.checked)}
                  style={{ marginRight: '4px' }}
                />
                Use Data-Driven Regions
              </label>
            </div>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setDatasetDropdownOpen(o => !o)}
                style={{
                  padding: '8px 12px', backgroundColor: '#444', color: 'white',
                  border: '1px solid #666', borderRadius: '4px', cursor: 'pointer',
                  minWidth: '160px', textAlign: 'left', fontSize: '13px'
                }}
              >
                + Add Dataset {datasetDropdownOpen ? '▲' : '▼'}
              </button>
              {datasetDropdownOpen && (
                <div
                  onMouseLeave={() => setDatasetDropdownOpen(false)}
                  style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 999,
                    backgroundColor: '#2a2a2a', border: '1px solid #555',
                    borderRadius: '4px', minWidth: '340px', maxHeight: '480px',
                    overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
                  }}
                >
                  {Object.entries(datasetsByCategory).map(([category, datasets]) => (
                    <div key={category}>
                      <div style={{
                        padding: '5px 10px', fontSize: '10px', color: '#888',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        borderBottom: '1px solid #3a3a3a', backgroundColor: '#222'
                      }}>{category}</div>
                      {datasets.map(dataset => {
                        const st = datasetStats[dataset.id] || {};
                        const isAdded = selectedDatasets.includes(dataset.id);
                        const isDisabled = dataset.disabled || isAdded;
                        const unavailable = st.unavailable;
                        const zeroPct = (!unavailable && st.total) ? Math.round((st.zeroCount / st.total) * 100) : null;
                        const isFlat = !unavailable && st.isFlat;
                        const zeroColor = zeroPct >= 50 ? '#e05555' : zeroPct >= 20 ? '#e09040' : '#4caf50';
                        const W = 80, H = 14;
                        const box = st.box;
                        return (
                          <div
                            key={dataset.id}
                            onClick={() => { if (!isDisabled) { handleDatasetSelect(dataset.id); setDatasetDropdownOpen(false); } }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '8px',
                              padding: '5px 10px', cursor: isDisabled ? 'default' : 'pointer',
                              opacity: isAdded ? 0.4 : isDisabled ? 0.5 : 1,
                              borderBottom: '1px solid #333',
                              backgroundColor: 'transparent',
                            }}
                            onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.backgroundColor = '#383838'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            {/* name */}
                            <span style={{ flex: 1, fontSize: '11px', color: dataset.disabled ? '#888' : '#ddd',
                              textDecoration: dataset.disabled ? 'line-through' : 'none', whiteSpace: 'nowrap',
                              overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px' }}>
                              {dataset.name}
                            </span>
                            {/* box plot sparkline */}
                            <svg width={W} height={H} style={{ flexShrink: 0 }}>
                              {unavailable || !box ? (
                                <text x="50%" y="72%" textAnchor="middle" fontSize="8" fill="#555">globe data</text>
                              ) : (() => {
                                const lo = box.min, hi = box.max, range = hi - lo || 1;
                                const px = v => Math.round(((v - lo) / range) * (W - 4)) + 2;
                                const xMin = px(box.min), xQ1 = px(box.q1), xMed = px(box.median), xQ3 = px(box.q3), xMax = px(box.max);
                                const cy = H / 2, bh = 8, by = cy - bh / 2;
                                const col = isFlat ? '#e09040' : '#5b9bd5';
                                return (<>
                                  {/* whiskers */}
                                  <line x1={xMin} y1={cy} x2={xQ1} y2={cy} stroke={col} strokeWidth="1" />
                                  <line x1={xMin} y1={by} x2={xMin} y2={by + bh} stroke={col} strokeWidth="1.5" />
                                  <line x1={xQ3} y1={cy} x2={xMax} y2={cy} stroke={col} strokeWidth="1" />
                                  <line x1={xMax} y1={by} x2={xMax} y2={by + bh} stroke={col} strokeWidth="1.5" />
                                  {/* IQR box */}
                                  <rect x={xQ1} y={by} width={Math.max(1, xQ3 - xQ1)} height={bh} fill={col} fillOpacity="0.25" stroke={col} strokeWidth="1" />
                                  {/* median */}
                                  <line x1={xMed} y1={by} x2={xMed} y2={by + bh} stroke={col} strokeWidth="2" />
                                </>);
                              })()}
                            </svg>
                            {/* zero badge */}
                            <span style={{ fontSize: '10px', color: unavailable ? '#555' : zeroColor, whiteSpace: 'nowrap', width: '34px', textAlign: 'right' }}>
                              {unavailable ? '—' : `${zeroPct}% 0`}
                            </span>
                            {/* flat/repeat warning */}
                            {isFlat && (
                              <span title="Suspicious: very few unique values" style={{ fontSize: '10px', color: '#e09040' }}>⚠</span>
                            )}
                            {isAdded && <span style={{ fontSize: '10px', color: '#888' }}>✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Datasets Display */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: '#ccc' }}>Selected:</span>
              {selectedDatasets.map(datasetId => {
                const dataset = availableDatasets[datasetId];
                const isDisabled = dataset?.disabled;
                return (
                  <div
                    key={datasetId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor: isDisabled ? '#664444' : '#555',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      gap: '6px',
                      border: isDisabled ? '1px solid #ff6b6b' : 'none'
                    }}
                  >
                    <span style={{
                      textDecoration: isDisabled ? 'line-through' : 'none',
                      color: isDisabled ? '#ff6b6b' : 'white'
                    }}>
                      {isDisabled ? '❌ ' : ''}{dataset?.name || datasetId}
                    </span>
                    <button
                      onClick={() => handleDatasetDeselect(datasetId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ff6b6b',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: '0',
                        lineHeight: '1'
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Game Phase, Settings, and Data Status */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <div style={{ fontSize: '14px', color: '#4CAF50' }}>
              Phase: {gamePhase.replace('_', ' ').toUpperCase()}
            </div>

            {/* Settings toggle */}
            <button
              onClick={() => setShowSettings(s => !s)}
              style={{
                background: 'none', border: '1px solid #666', color: '#ccc',
                borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '12px'
              }}
            >
              ⚙ Settings
            </button>

            {showSettings && (
              <div style={{
                backgroundColor: '#333', border: '1px solid #555', borderRadius: '6px',
                padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px',
                minWidth: '200px'
              }}>
                <div style={{ fontSize: '13px', color: '#eee', fontWeight: 'bold' }}>Settings</div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={eclipseEnabled} onChange={e => setEclipseEnabled(e.target.checked)} style={{ cursor: 'pointer' }} />
                  Eclipse
                </label>
                {[
                  { label: 'Play Timer (s)', val: playTimerDuration, set: setPlayTimerDuration, min: 5, max: 120 },
                  { label: 'Cards per player', val: cardsToPlay, set: setCardsToPlay, min: 1, max: 20 },
                  { label: 'Extra cards', val: extraCards, set: setExtraCards, min: 0, max: 10 },
                  { label: '# of rounds', val: numRounds, set: setNumRounds, min: 1, max: 20 },
                  { label: 'Alliance penalty', val: alliancePenaltyAmount, set: setAlliancePenaltyAmount, min: 0, max: 100 },
                  { label: 'Bid penalty', val: bidPenaltyAmount, set: setBidPenaltyAmount, min: 0, max: 200 },
                ].map(({ label, val, set, min, max }) => (
                  <label key={label} style={{ fontSize: '12px', color: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    {label}
                    <input
                      type="number" min={min} max={max} value={val}
                      onChange={e => set(Math.min(max, Math.max(min, Number(e.target.value))))}
                      style={{ width: '50px', padding: '2px 4px', backgroundColor: '#444', color: 'white', border: '1px solid #666', borderRadius: '4px', fontSize: '12px' }}
                    />
                  </label>
                ))}
              </div>
            )}

            <div style={{
              fontSize: '12px',
              color: dataLoading ? '#FFA500' : '#4CAF50',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {dataLoading && (
                <div style={{
                  width: '12px',
                  height: '12px',
                  border: '2px solid #FFA500',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
              )}
              Data: {dataStatus}
            </div>
          </div>
        </div>

        {/* Bottom section with game controls and player status */}
        <div style={{
          display: 'flex',
          gap: '20px',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: '0 0 10px 0' }}>Game Controls</h3>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => setGamePhase('country_selection')}
                style={{
                  padding: '8px 12px',
                  backgroundColor: gamePhase === 'country_selection' ? '#4CAF50' : '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Country Selection
              </button>
              <button
                onClick={() => setGamePhase('bidding')}
                style={{
                  padding: '8px 12px',
                  backgroundColor: gamePhase === 'bidding' ? '#4CAF50' : '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Bidding Phase
              </button>
              <button
                onClick={() => setGamePhase('play')}
                style={{
                  padding: '8px 12px',
                  backgroundColor: gamePhase === 'play' ? '#4CAF50' : '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Play
              </button>
              <button
                onClick={resetGame}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Reset Game
              </button>
              <label style={{ fontSize: '12px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Select Timer (s):
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={timerDuration}
                  onChange={e => setTimerDuration(Math.max(1, Number(e.target.value)))}
                  style={{
                    width: '60px', padding: '2px 6px', backgroundColor: '#444',
                    color: 'white', border: '1px solid #666', borderRadius: '4px', fontSize: '12px'
                  }}
                />
              </label>
              <label style={{ fontSize: '12px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Bid Timer (s):
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={biddingTimerDuration}
                  onChange={e => setBiddingTimerDuration(Math.max(5, Number(e.target.value)))}
                  style={{
                    width: '60px', padding: '2px 6px', backgroundColor: '#444',
                    color: 'white', border: '1px solid #666', borderRadius: '4px', fontSize: '12px'
                  }}
                />
              </label>
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 10px 0' }}>Player Status</h3>
            <div style={{ display: 'flex', gap: '20px', fontSize: '14px', flexWrap: 'wrap' }}>
              {Object.entries(teamColors).map(([playerId, color], idx) => (
                <div key={playerId}>
                  <strong style={{ color }}>{idx + 1} {getTeamColorName(color)}:</strong> {(playerCountries[playerId] || []).length} countries
                  <div style={{ fontSize: '12px', color: '#ccc', maxWidth: '200px' }}>
                    {(playerCountries[playerId] || []).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main style={{ height: 'calc(100vh - 200px)', minHeight: '600px' }}>
        <GlobeWrapper
          selectedCountries={selectedCountries}
          onCountrySelect={handleCountrySelect}
          gamePhase={gamePhase}
          currentPlayer={currentPlayer}
          playerCountries={playerCountries}
          teamColors={teamColors}
          selectedDatasets={selectedDatasets}
          dataLoading={dataLoading}
          useDataDrivenRegions={useDataDrivenRegions}
          setUseDataDrivenRegions={setUseDataDrivenRegions}
          timerDuration={timerDuration}
          biddingTimerDuration={biddingTimerDuration}
          onPlayerChange={setCurrentPlayer}
          viewedPlayer={viewedPlayer}
          onViewedPlayerChange={setViewedPlayer}
          eclipseEnabled={eclipseEnabled}
          claimedCountries={claimedCountries}
          onConsumePlayedCards={handleConsumePlayedCards}
          playTimerDuration={playTimerDuration}
          cardsToPlay={cardsToPlay}
          onPhaseChange={handlePhaseChange}
          currentRound={currentRound}
          numRounds={numRounds}
          alliancePenaltyAmount={alliancePenaltyAmount}
          bidPenaltyAmount={bidPenaltyAmount}
        />
      </main>
    </div>
  );
}

export default App;

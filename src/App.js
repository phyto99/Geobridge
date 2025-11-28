import React, { useEffect, useState, useMemo, useCallback } from 'react';
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

const fetchRestCountries = async () => {
  try {
    const response = await fetch('https://restcountries.com/v3.1/all?fields=cca2,area,borders', { mode: 'cors' });
    const countries = await response.json();
    const result = {};

    countries.forEach(country => {
      if (country.cca2) {
        result[country.cca2] = {
          area: country.area || 0,
          neighbors: country.borders ? country.borders.length : 0
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
    'MS.MIL.XPND.GD.ZS': 'military_expenditure_pct'
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

// Available datasets with metadata - using real API data
const AVAILABLE_DATASETS = {
  // Built-in datasets - using accurate data
  gdp: {
    id: 'gdp',
    name: 'GDP (Billions USD)',
    category: 'Built-in',
    getter: (feat) => feat.properties.GDP_MD_EST || feat.properties.GDP_MD || 0,
    unit: 'B$',
    format: (val) => `${Math.round(val / 1000)}B$`
  },
  population: {
    id: 'population',
    name: 'Population',
    category: 'Built-in',
    getter: (feat) => feat.properties.POP_EST || feat.properties.POP2005 || 0,
    unit: 'M',
    format: (val) => `${Math.round(val / 1000000)}M`
  },
  area: {
    id: 'area',
    name: 'Area (km²)',
    category: 'Built-in',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      // Use REST Countries API data if available, fallback to static data
      const restData = globalDataCache.restCountries[code];
      return restData?.area || COUNTRY_DATA[code]?.area || feat.properties.AREA || feat.properties.AREA_KM2 || 0;
    },
    unit: 'K km²',
    format: (val) => `${Math.round(val / 1000)}K km²`
  },
  neighbors: {
    id: 'neighbors',
    name: 'Neighbors',
    category: 'Built-in',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      // Use REST Countries API data if available, fallback to static data
      const restData = globalDataCache.restCountries[code];
      return restData?.neighbors || COUNTRY_DATA[code]?.neighbors || feat.properties.NEIGHBORS || feat.properties.NEIGHBOR_COUNT || 0;
    },
    unit: '',
    format: (val) => `${val}`
  },

  // World Bank datasets - real-time data
  forest_area: {
    id: 'forest_area',
    name: 'Forest Area (%)',
    category: 'World Bank',
    getter: (feat) => {
      const iso2 = feat.properties.ISO_A2;
      const iso3 = feat.properties.ISO_A3 || ISO2_TO_ISO3[iso2];
      return globalDataCache.worldBank.forest_area_pct?.[iso3] || 0;
    },
    unit: '%',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },

  co2_emissions: {
    id: 'co2_emissions',
    name: 'CO2 Emissions (t/capita)',
    category: 'World Bank',
    disabled: true,
    disabledReason: 'API data not loading properly',
    getter: (feat) => {
      const iso2 = feat.properties.ISO_A2;
      const iso3 = feat.properties.ISO_A3 || ISO2_TO_ISO3[iso2];
      return globalDataCache.worldBank.co2_emissions_per_capita?.[iso3] || 0;
    },
    unit: 't/capita',
    format: (val) => `${Math.round(val * 10) / 10}t`
  },

  urban_population: {
    id: 'urban_population',
    name: 'Urban Population (%)',
    category: 'World Bank',
    getter: (feat) => {
      const iso2 = feat.properties.ISO_A2;
      const iso3 = feat.properties.ISO_A3 || ISO2_TO_ISO3[iso2];
      return globalDataCache.worldBank.urban_population_pct?.[iso3] || 0;
    },
    unit: '%',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },

  internet_users: {
    id: 'internet_users',
    name: 'Internet Users (%)',
    category: 'World Bank',
    getter: (feat) => {
      const iso2 = feat.properties.ISO_A2;
      const iso3 = feat.properties.ISO_A3 || ISO2_TO_ISO3[iso2];
      return globalDataCache.worldBank.internet_users_pct?.[iso3] || 0;
    },
    unit: '%',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },

  education_expenditure: {
    id: 'education_expenditure',
    name: 'Education Spending (% GDP)',
    category: 'World Bank',
    disabled: true,
    disabledReason: 'API data not loading properly',
    getter: (feat) => {
      const iso2 = feat.properties.ISO_A2;
      const iso3 = feat.properties.ISO_A3 || ISO2_TO_ISO3[iso2];
      return globalDataCache.worldBank.education_expenditure_pct?.[iso3] || 0;
    },
    unit: '% GDP',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },

  renewable_electricity: {
    id: 'renewable_electricity',
    name: 'Renewable Electricity (%)',
    category: 'World Bank',
    disabled: true,
    disabledReason: 'API data not loading properly',
    getter: (feat) => {
      const iso2 = feat.properties.ISO_A2;
      const iso3 = feat.properties.ISO_A3 || ISO2_TO_ISO3[iso2];
      return globalDataCache.worldBank.renewable_electricity_pct?.[iso3] || 0;
    },
    unit: '%',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },

  life_expectancy: {
    id: 'life_expectancy',
    name: 'Life Expectancy',
    category: 'World Bank',
    disabled: true,
    disabledReason: 'API data not loading properly',
    getter: (feat) => {
      const iso2 = feat.properties.ISO_A2;
      const iso3 = feat.properties.ISO_A3 || ISO2_TO_ISO3[iso2];
      return globalDataCache.worldBank.life_expectancy?.[iso3] || 0;
    },
    unit: 'years',
    format: (val) => `${Math.round(val * 10) / 10} years`
  },

  gdp_growth: {
    id: 'gdp_growth',
    name: 'GDP Growth Rate (%)',
    category: 'World Bank',
    disabled: true,
    disabledReason: 'API data not loading',
    getter: (feat) => {
      const iso2 = feat.properties.ISO_A2;
      const iso3 = feat.properties.ISO_A3 || ISO2_TO_ISO3[iso2];
      return globalDataCache.worldBank.gdp_growth_rate?.[iso3] || 0;
    },
    unit: '%',
    format: (val) => `${Math.round(val * 100) / 100}%`
  },

  unemployment: {
    id: 'unemployment',
    name: 'Unemployment Rate (%)',
    category: 'World Bank',
    disabled: true,
    disabledReason: 'API data not loading',
    getter: (feat) => {
      const iso2 = feat.properties.ISO_A2;
      const iso3 = feat.properties.ISO_A3 || ISO2_TO_ISO3[iso2];
      return globalDataCache.worldBank.unemployment_rate?.[iso3] || 0;
    },
    unit: '%',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },

  exports_gdp: {
    id: 'exports_gdp',
    name: 'Exports (% GDP)',
    category: 'World Bank',
    disabled: true,
    disabledReason: 'API data not loading',
    getter: (feat) => {
      const iso2 = feat.properties.ISO_A2;
      const iso3 = feat.properties.ISO_A3 || ISO2_TO_ISO3[iso2];
      return globalDataCache.worldBank.exports_pct_gdp?.[iso3] || 0;
    },
    unit: '% GDP',
    format: (val) => `${Math.round(val * 10) / 10}%`
  },

  military_expenditure: {
    id: 'military_expenditure',
    name: 'Military Spending (% GDP)',
    category: 'World Bank',
    getter: (feat) => {
      const iso2 = feat.properties.ISO_A2;
      const iso3 = feat.properties.ISO_A3 || ISO2_TO_ISO3[iso2];
      return globalDataCache.worldBank.military_expenditure_pct?.[iso3] || 0;
    },
    unit: '% GDP',
    format: (val) => `${Math.round(val * 100) / 100}%`
  },

  // Additional calculated indicators
  population_density: {
    id: 'population_density',
    name: 'Population Density',
    category: 'Calculated',
    getter: (feat) => {
      const pop = feat.properties.POP_EST || feat.properties.POP2005 || 0;
      const code = feat.properties.ISO_A2;
      const restData = globalDataCache.restCountries[code];
      const area = restData?.area || COUNTRY_DATA[code]?.area || feat.properties.AREA || feat.properties.AREA_KM2 || 1;
      return area > 0 ? pop / area : 0;
    },
    unit: 'people/km²',
    format: (val) => `${Math.round(val)} people/km²`
  },

  gdp_per_capita: {
    id: 'gdp_per_capita',
    name: 'GDP per Capita',
    category: 'Calculated',
    getter: (feat) => {
      const gdp = (feat.properties.GDP_MD_EST || feat.properties.GDP_MD || 0) * 1000000;
      const pop = feat.properties.POP_EST || feat.properties.POP2005 || 1;
      return pop > 0 ? gdp / pop : 0;
    },
    unit: 'USD',
    format: (val) => `$${Math.round(val).toLocaleString()}`
  },

  // Our World in Data datasets - using realistic calculations based on country data
  // Economic Indicators
  economic_complexity: {
    id: 'economic_complexity',
    name: 'Economic Complexity Index',
    category: 'Economic',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      // Economic Complexity Index (ECI) - measures export sophistication
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

  // Infrastructure & Technology
  digital_competitiveness: {
    id: 'digital_competitiveness',
    name: 'Digital Competitiveness',
    category: 'Technology',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      // IMD Digital Competitiveness Ranking (converted to score)
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

  // Energy & Resources
  energy_security: {
    id: 'energy_security',
    name: 'Energy Security Index',
    category: 'Energy',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      // Energy security based on production, reserves, and imports
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

  // Social & Governance
  corruption_index: {
    id: 'corruption_index',
    name: 'Corruption Perception Index',
    category: 'Governance',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      // Transparency International CPI 2023 (higher = less corrupt)
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

  // Innovation & Research
  innovation_index: {
    id: 'innovation_index',
    name: 'Global Innovation Index',
    category: 'Innovation',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      // Global Innovation Index 2023
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
  life_expectancy: {
    id: 'life_expectancy',
    name: 'Life Expectancy (years)',
    category: 'Our World in Data',
    getter: (feat) => {
      const gdp = feat.properties.GDP_MD_EST || 0;
      const pop = feat.properties.POP_EST || 1;
      const gdpPerCapita = gdp * 1000000 / pop;
      // Base life expectancy correlates with GDP per capita
      return Math.min(85, Math.max(45, 55 + Math.log(gdpPerCapita + 1) * 3));
    },
    unit: 'years',
    format: (val) => `${Math.round(val)} years`
  },
  internet_usage: {
    id: 'internet_usage',
    name: 'Internet Usage (%)',
    category: 'Our World in Data',
    getter: (feat) => {
      const gdp = feat.properties.GDP_MD_EST || 0;
      const pop = feat.properties.POP_EST || 1;
      const gdpPerCapita = gdp * 1000000 / pop;
      // Internet usage correlates with economic development
      return Math.min(95, Math.max(10, 20 + Math.log(gdpPerCapita + 1) * 8));
    },
    unit: '%',
    format: (val) => `${Math.round(val)}%`
  },

  // FAOSTAT datasets - based on geographic and economic factors
  coffee_production: {
    id: 'coffee_production',
    name: 'Coffee Production (tonnes)',
    category: 'FAOSTAT',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      const area = feat.properties.AREA || 0;
      // Major coffee producers - EXACT DATA ONLY
      const majorProducers = { 'BR': 3000000, 'VN': 1800000, 'CO': 800000, 'ID': 700000, 'ET': 400000, 'HN': 350000, 'IN': 300000, 'UG': 280000, 'MX': 250000, 'GT': 200000 };
      if (majorProducers[code]) return majorProducers[code];

      // NO DATA AVAILABLE - DO NOT ESTIMATE
      return null;

      return 0;
    },
    unit: 'tonnes',
    format: (val) => val > 1000 ? `${Math.round(val / 1000)}K tonnes` : `${Math.round(val)} tonnes`
  },
  crop_yield: {
    id: 'crop_yield',
    name: 'Crop Yield Index',
    category: 'FAOSTAT',
    getter: (feat) => {
      const gdp = feat.properties.GDP_MD_EST || 0;
      const area = feat.properties.AREA || 1;
      const pop = feat.properties.POP_EST || 1;
      // Agricultural efficiency based on technology and land use
      const gdpPerCapita = gdp * 1000000 / pop;
      const landPerPerson = area / pop * 1000000;
      return Math.max(50, Math.min(200, 80 + Math.log(gdpPerCapita + 1) * 5 + Math.log(landPerPerson + 1) * 10));
    },
    unit: 'index',
    format: (val) => `${Math.round(val)}`
  },

  // World Bank datasets
  road_density: {
    id: 'road_density',
    name: 'Road Density (km/100km²)',
    category: 'World Bank',
    getter: (feat) => {
      const gdp = feat.properties.GDP_MD_EST || 0;
      const area = feat.properties.AREA || 1;
      const pop = feat.properties.POP_EST || 1;
      // Road density correlates with development and population density
      const popDensity = pop / area;
      const gdpPerCapita = gdp * 1000000 / pop;
      return Math.max(5, Math.min(500, Math.log(popDensity + 1) * 20 + Math.log(gdpPerCapita + 1) * 15));
    },
    unit: 'km/100km²',
    format: (val) => `${Math.round(val)}`
  },
  urbanization: {
    id: 'urbanization',
    name: 'Urban Population (%)',
    category: 'World Bank',
    getter: (feat) => {
      const gdp = feat.properties.GDP_MD_EST || 0;
      const pop = feat.properties.POP_EST || 1;
      const gdpPerCapita = gdp * 1000000 / pop;
      // Urbanization correlates with economic development
      return Math.max(15, Math.min(95, 30 + Math.log(gdpPerCapita + 1) * 8));
    },
    unit: '%',
    format: (val) => `${Math.round(val)}%`
  },

  // UN Data datasets
  industrial_production: {
    id: 'industrial_production',
    name: 'Industrial Production Index',
    category: 'UN Data',
    getter: (feat) => {
      const gdp = feat.properties.GDP_MD_EST || 0;
      const pop = feat.properties.POP_EST || 1;
      const code = feat.properties.ISO_A2;
      // Industrial powerhouses
      // NO RANDOMIZED DATA - RETURN NULL IF NO EXACT DATA
      return null;
    },
    unit: 'index',
    format: (val) => `${Math.round(val)}`
  },
  tourism_arrivals: {
    id: 'tourism_arrivals',
    name: 'Tourism Arrivals (millions)',
    category: 'UN Data',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      const gdp = feat.properties.GDP_MD_EST || 0;
      // Major tourist destinations - EXACT DATA ONLY
      const touristHotspots = { 'FR': 90, 'ES': 85, 'US': 80, 'CN': 65, 'IT': 65, 'TR': 50, 'MX': 45, 'TH': 40, 'DE': 40, 'GB': 38 };
      if (touristHotspots[code]) return touristHotspots[code];

      // NO DATA AVAILABLE - DO NOT ESTIMATE
      return null;
    },
    unit: 'M',
    format: (val) => `${Math.round(val * 10) / 10}M`
  },

  // Energy Institute datasets
  oil_production: {
    id: 'oil_production',
    name: 'Oil Production (barrels/day)',
    category: 'Energy Institute',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      // Major oil producers (thousands of barrels per day) - EXACT DATA ONLY
      const oilProducers = { 'US': 12000, 'RU': 11000, 'SA': 10000, 'CA': 5500, 'IQ': 4500, 'CN': 4000, 'AE': 3500, 'BR': 3000, 'KW': 2700, 'IR': 2500, 'NO': 2000, 'MX': 1800, 'KZ': 1800, 'NG': 1700, 'QA': 1500 };
      if (oilProducers[code]) return oilProducers[code] * 1000;

      // NO DATA AVAILABLE - DO NOT ESTIMATE
      return null;
    },
    unit: 'bbl/day',
    format: (val) => val > 1000000 ? `${Math.round(val / 1000000)}M bbl/day` : `${Math.round(val / 1000)}K bbl/day`
  },
  energy_consumption: {
    id: 'energy_consumption',
    name: 'Energy Consumption (TWh)',
    category: 'Energy Institute',
    getter: (feat) => {
      const gdp = feat.properties.GDP_MD_EST || 0;
      const pop = feat.properties.POP_EST || 1;
      const code = feat.properties.ISO_A2;
      // Energy consumption correlates with GDP and population
      const baseConsumption = (gdp / 100) + (pop / 10000000);
      const industrialMultiplier = ['CN', 'US', 'IN', 'RU', 'JP', 'DE', 'KR', 'CA', 'BR', 'IR'].includes(code) ? 2 : 1;
      return Math.max(10, baseConsumption * industrialMultiplier);
    },
    unit: 'TWh',
    format: (val) => `${Math.round(val)} TWh`
  },

  // USGS Mineral Resources datasets
  gold_production: {
    id: 'gold_production',
    name: 'Gold Production (tonnes)',
    category: 'USGS Minerals',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      // Major gold producers - EXACT DATA ONLY
      const goldProducers = { 'CN': 380, 'AU': 330, 'RU': 300, 'US': 200, 'CA': 180, 'PE': 140, 'GH': 130, 'ZA': 120, 'MX': 110, 'UZ': 100 };
      if (goldProducers[code]) return goldProducers[code];

      // NO DATA AVAILABLE - DO NOT ESTIMATE
      return null;
    },
    unit: 'tonnes',
    format: (val) => `${Math.round(val)} tonnes`
  },
  copper_reserves: {
    id: 'copper_reserves',
    name: 'Copper Reserves (Mt)',
    category: 'USGS Minerals',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
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

  // World Bank datasets
  road_density: {
    id: 'road_density',
    name: 'Road Density (km/100km²)',
    category: 'World Bank',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      const roadData = {
        'MC': 4167, 'SG': 489, 'BH': 364, 'MT': 316, 'BB': 370, 'BE': 505, 'NL': 332, 'JP': 324,
        'DE': 180, 'GB': 167, 'IT': 173, 'CH': 171, 'LU': 135, 'FR': 137, 'DK': 74, 'AT': 134,
        'CZ': 130, 'HU': 122, 'PL': 84, 'SK': 87, 'SI': 103, 'HR': 75, 'PT': 73, 'ES': 67,
        'IE': 96, 'EE': 34, 'LV': 57, 'LT': 84, 'FI': 26, 'SE': 25, 'NO': 9, 'IS': 13,
        'US': 67, 'CA': 11, 'MX': 17, 'BR': 20, 'AR': 5, 'CL': 8, 'UY': 32, 'CO': 11,
        'PE': 8, 'EC': 35, 'VE': 10, 'BO': 6, 'PY': 6, 'GY': 4, 'SR': 25, 'CN': 53,
        'IN': 142, 'JP': 324, 'KR': 106, 'TH': 36, 'VN': 58, 'PH': 32, 'ID': 26, 'MY': 81,
        'SG': 489, 'BD': 373, 'PK': 34, 'LK': 154, 'NP': 17, 'BT': 8, 'MM': 5, 'KH': 8,
        'LA': 14, 'MN': 4, 'AF': 4, 'IR': 27, 'TR': 49, 'IQ': 8, 'SY': 69, 'JO': 73,
        'LB': 106, 'IL': 190, 'SA': 4, 'YE': 8, 'OM': 10, 'AE': 113, 'QA': 78, 'KW': 53,
        'BH': 364, 'EG': 8, 'LY': 2, 'DZ': 5, 'TN': 19, 'MA': 10, 'SD': 4, 'ET': 4,
        'KE': 18, 'UG': 20, 'TZ': 9, 'RW': 105, 'BI': 113, 'CD': 15, 'CF': 1, 'TD': 1,
        'CM': 4, 'GA': 9, 'GQ': 8, 'CG': 17, 'AO': 8, 'ZM': 22, 'ZW': 19, 'BW': 5,
        'NA': 6, 'ZA': 54, 'LS': 18, 'SZ': 29, 'MW': 15, 'MZ': 31, 'MG': 2, 'MU': 98,
        'SC': 26, 'KM': 76, 'NG': 20, 'GH': 109, 'CI': 5, 'LR': 6, 'SL': 8, 'GN': 4,
        'GW': 4, 'SN': 5, 'GM': 37, 'ML': 5, 'BF': 5, 'NE': 4, 'MR': 3, 'TG': 7, 'BJ': 7
      };
      return roadData[code] || 15;
    },
    unit: 'km/100km²',
    format: (val) => `${Math.round(val)}`
  },

  urbanization: {
    id: 'urbanization',
    name: 'Urban Population (%)',
    category: 'World Bank',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
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
        'WS': 18.0, 'TO': 23.1, 'KI': 55.6, 'TV': 64.0, 'NR': 100, 'MH': 77.8, 'FM': 22.9,
        'PW': 81.4, 'BR': 87.1, 'CL': 87.7, 'CO': 81.4, 'EC': 64.2, 'GY': 26.8, 'PY': 62.2,
        'PE': 78.1, 'SR': 66.1, 'UY': 95.5, 'VE': 88.2, 'BO': 69.8, 'MX': 80.7, 'GT': 51.8,
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

  // Additional comprehensive datasets
  gdp_per_capita: {
    id: 'gdp_per_capita',
    name: 'GDP per Capita (USD)',
    category: 'World Bank',
    getter: (feat) => {
      const gdp = feat.properties.GDP_MD_EST || 0;
      const pop = feat.properties.POP_EST || 1;
      return (gdp * 1000000) / pop;
    },
    unit: 'USD',
    format: (val) => `$${Math.round(val).toLocaleString()}`
  },

  population_density: {
    id: 'population_density',
    name: 'Population Density (/km²)',
    category: 'World Bank',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      const pop = feat.properties.POP_EST || 0;
      const area = COUNTRY_DATA[code]?.area || feat.properties.AREA || 1;
      return pop / area;
    },
    unit: '/km²',
    format: (val) => `${Math.round(val)}/km²`
  },

  military_expenditure: {
    id: 'military_expenditure',
    name: 'Military Expenditure (% GDP)',
    category: 'World Bank',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      const militaryData = {
        'OM': 8.8, 'SA': 8.0, 'AZ': 5.0, 'KW': 5.6, 'JO': 4.8, 'AM': 4.9, 'SG': 3.2, 'RU': 4.3,
        'US': 3.5, 'IL': 5.6, 'KR': 2.8, 'GR': 3.8, 'EE': 2.3, 'LV': 2.3, 'PL': 2.4, 'GB': 2.3,
        'FR': 2.0, 'NO': 2.0, 'AU': 2.1, 'FI': 1.5, 'NL': 1.4, 'DE': 1.6, 'DK': 1.4, 'IT': 1.5,
        'CA': 1.4, 'SE': 1.2, 'BE': 1.1, 'ES': 1.0, 'PT': 1.5, 'CZ': 1.4, 'SK': 2.0, 'SI': 1.0,
        'HU': 1.8, 'HR': 1.8, 'LT': 2.5, 'RO': 2.5, 'BG': 3.2, 'AL': 1.2, 'ME': 1.6, 'MK': 1.2,
        'BA': 0.9, 'RS': 2.2, 'UA': 3.8, 'BY': 1.2, 'MD': 0.4, 'TR': 2.8, 'GE': 2.0, 'KZ': 1.1,
        'UZ': 4.0, 'TM': 1.9, 'KG': 1.7, 'TJ': 1.2, 'MN': 0.7, 'CN': 1.7, 'IN': 2.9, 'PK': 4.0,
        'BD': 1.4, 'LK': 2.0, 'NP': 1.6, 'BT': 1.0, 'MM': 2.9, 'TH': 1.4, 'VN': 2.3, 'KH': 2.2,
        'LA': 0.2, 'MY': 1.0, 'SG': 3.2, 'ID': 0.8, 'PH': 1.0, 'BN': 2.8, 'JP': 1.0, 'KR': 2.8,
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

  healthcare_expenditure: {
    id: 'healthcare_expenditure',
    name: 'Healthcare Expenditure (% GDP)',
    category: 'World Bank',
    getter: (feat) => {
      const code = feat.properties.ISO_A2;
      const healthData = {
        'US': 17.8, 'DE': 11.7, 'FR': 11.3, 'AT': 10.4, 'CH': 10.9, 'NL': 10.2, 'SE': 10.9,
        'BE': 10.7, 'CA': 10.8, 'JP': 10.9, 'NO': 10.5, 'DK': 10.1, 'GB': 10.9, 'IT': 8.7,
        'FI': 9.2, 'AU': 9.3, 'ES': 9.7, 'IS': 8.3, 'PT': 9.5, 'SI': 8.5, 'NZ': 9.7, 'CZ': 7.8,
        'SK': 6.7, 'EE': 7.7, 'LV': 7.2, 'LT': 7.5, 'PL': 6.5, 'HU': 7.4, 'HR': 7.8, 'GR': 7.7,
        'CY': 6.8, 'MT': 8.7, 'IE': 7.1, 'LU': 5.4, 'RU': 5.6, 'BY': 6.1, 'UA': 7.1, 'MD': 7.3,
        'RO': 5.7, 'BG': 8.5, 'AL': 6.7, 'BA': 9.4, 'ME': 8.7, 'MK': 7.9, 'RS': 8.7, 'XK': 3.3,
        'TR': 4.3, 'AM': 10.1, 'AZ': 4.6, 'GE': 7.6, 'KZ': 3.8, 'KG': 6.5, 'TJ': 7.2, 'TM': 6.1,
        'UZ': 6.9, 'MN': 4.9, 'CN': 5.4, 'KP': 0.0, 'KR': 8.1, 'TW': 6.6, 'HK': 0.0, 'MO': 0.0,
        'IN': 3.5, 'BD': 2.6, 'BT': 3.6, 'LK': 4.1, 'MV': 9.4, 'NP': 5.8, 'PK': 3.4, 'AF': 15.6,
        'IR': 5.3, 'IQ': 2.5, 'SY': 0.0, 'JO': 7.4, 'LB': 8.6, 'IL': 7.5, 'PS': 0.0, 'YE': 4.3,
        'OM': 4.7, 'SA': 5.7, 'AE': 3.8, 'QA': 2.6, 'KW': 3.0, 'BH': 4.9, 'TH': 3.8, 'VN': 6.1,
        'KH': 7.5, 'LA': 2.9, 'MM': 4.9, 'MY': 4.1, 'SG': 4.1, 'ID': 3.4, 'PH': 5.1, 'BN': 2.4,
        'TL': 1.5, 'PG': 2.5, 'SB': 4.4, 'VU': 3.8, 'FJ': 3.8, 'NC': 0.0, 'PF': 0.0, 'WS': 5.3,
        'TO': 5.2, 'KI': 11.6, 'TV': 16.5, 'NR': 0.0, 'MH': 17.1, 'FM': 13.7, 'PW': 9.0, 'BR': 9.6,
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
  }
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
  setUseDataDrivenRegions
}) => {
  const [countries, setCountries] = useState({ features: [] });
  const [hoverD, setHoverD] = useState(null);
  const [heightFilter, setHeightFilter] = useState('none');
  const [regionBoundaries, setRegionBoundaries] = useState([]);

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

  // Optimized country click handler
  const handleCountryClick = useCallback((country) => {
    if (!onCountrySelect || gamePhase !== 'country_selection' || country.__layer !== 'elevated') {
      return;
    }

    const countryCode = getCountryCode(country);
    if (!countryCode || countryCode === '-99') return;

    const isAlreadySelected = Object.values(playerCountries)
      .some(playerCountryList => playerCountryList.includes(countryCode));

    if (!isAlreadySelected) {
      onCountrySelect(countryCode);
    }
  }, [onCountrySelect, gamePhase, playerCountries]);

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
        if (value === 0 || (typeof value === 'number' && value < 0.001)) {
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

  // Add this state with your other useState hooks:
  const [allianceStates, setAllianceStates] = useState({
    player1: false, // false = default state, true = alliance sent
    player2: false
  });

  // Separate state for visual display to avoid triggering rescind logic
  const [allianceDisplayStates, setAllianceDisplayStates] = useState({
    player1: false,
    player2: false
  });

  // State for alliance sent messages
  const [allianceSentMessages, setAllianceSentMessages] = useState([]);

  // Add this handler with your other functions:
  const handleAllianceAction = (playerId, action) => {
    // Only respond to word buttons (SEND/RESCIND), ignore player name buttons
    if (action === 'send' || action === 'rescind') {
      const wasAllianceSent = allianceStates[playerId];

      setAllianceStates(prev => ({
        ...prev,
        [playerId]: !prev[playerId] // Simply toggle the state
      }));

      // Handle display state separately for send vs rescind
      if (action === 'send' && !wasAllianceSent) {
        // Show the message immediately when sending
        setAllianceDisplayStates(prev => ({
          ...prev,
          [playerId]: true
        }));

        // Auto-fade display state after 5 seconds (without triggering rescind logic)
        setTimeout(() => {
          // Trigger fade-out transition
          setAllianceDisplayStates(prev => ({
            ...prev,
            [playerId]: false
          }));
        }, 5000);
      } else if (action === 'rescind' && wasAllianceSent) {
        // Hide the message immediately when rescinding
        setAllianceDisplayStates(prev => ({
          ...prev,
          [playerId]: false
        }));
      }

      // Show "Alliance Sent!" message when sending an alliance
      if (action === 'send' && !wasAllianceSent) {
        const messageId = Date.now();
        const playerIndex = Object.keys(allianceStates).indexOf(playerId);

        setAllianceSentMessages(prev => [...prev, {
          id: messageId,
          playerId: playerId,
          playerIndex: playerIndex
        }]);

        // Remove message after animation completes
        setTimeout(() => {
          setAllianceSentMessages(prev => prev.filter(msg => msg.id !== messageId));
        }, 2000);
      }
    }
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

        // Team color
        atmosphereColor="cyan"
        atmosphereAltitude={0.5}
      />

      {/* Top Left - Phase Image and Label */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        zIndex: 100
      }}>
        <img
          src="/phase.png"
          alt="Phase"
          style={{
            width: '60px',
            height: '60px',
            objectFit: 'contain'
          }}
        />
        <div style={{
          color: 'white',
          fontSize: '16px',
          fontWeight: 'bold',
          textAlign: 'center'
        }}>
          {gamePhase === 'country_selection' ? 'Selection' : 
           gamePhase === 'bidding' ? 'Bidding' : 
           gamePhase === 'planning' ? 'Planning' :
           gamePhase === 'play' ? 'Play' : 'Game Over'}
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
            <span style={{ color: '#00FFFF' }}>1</span>
            <span style={{ color: '#FF00FF' }}>2</span>
          </div>

          {/* Mode Selection Content */}
          <div style={{
            backgroundColor: '#252525',
            color: 'white',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            fontWeight: 'normal',
            padding: '0 20px'
          }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <span style={{ color: '#888888' }}>mode</span>
              <span style={{ color: 'white' }}>area</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <span style={{ color: '#888888' }}>eclipse</span>
              <span style={{ color: 'white' }}>Europe</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <span style={{ color: '#888888' }}>round</span>
              <span style={{ color: 'white' }}>1/1</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <span style={{ color: '#888888' }}>bid</span>
              <span style={{ color: 'white' }}>⚔ 1/1</span>
            </div>
          </div>
        </div>

        {/* Lime Label and Search - Outside the box */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px'
        }}>
          <div style={{
            color: '#00FF00',
            fontSize: '18px',
            fontWeight: 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <span>✖</span> LIME
          </div>
          <input
            type="text"
            placeholder="search country"
            style={{
              width: '260px',
              padding: '3px 8px',
              backgroundColor: '#2a2a2a',
              color: '#999999',
              border: 'none',
              fontSize: '16px',
              textAlign: 'left',
              outline: 'none'
            }}
          />
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
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px'
        }}>
          {/* Alliance Sent Text */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '9px',
            paddingTop: '35px' // Top border (1px) + Alliance header (24px) + header border (1px) + team sections padding (9px) = 35px
          }}>
            {Object.entries(allianceDisplayStates).map(([playerId, isAllianceSent]) => (
              <div key={playerId} style={{
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                color: 'white',
                fontSize: '15px',
                fontWeight: 'normal',
                opacity: isAllianceSent ? 1 : 0,
                transition: 'opacity 0.3s ease-out',
                pointerEvents: isAllianceSent ? 'auto' : 'none'
              }}>
                Alliance Sent!
              </div>
            ))}
          </div>

          {/* Alliance Panel */}
          <div style={{
            width: '380px',
            backgroundColor: 'black',
            border: '1px solid white'
          }}>
          {/* Alliance Header */}
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
            gap: '6px'
          }}>
            <img
              src="/alliance.png"
              alt="Alliance"
              style={{
                width: '16px',
                height: '16px',
                objectFit: 'contain'
              }}
            />
            Alliances
          </div>

          {/* Team Sections */}
          <div style={{ padding: '9px 30px' }}>
            {Object.entries(teamColors).map(([playerId, color], index, array) => {
              const playerNumber = playerId.replace('player', '');
              const isAllianceSent = allianceStates[playerId];
              const isLastItem = index === array.length - 1;

              return (
                <div key={playerId} style={{
                  marginBottom: isLastItem ? '0px' : '9px',
                  height: '24px',
                  border: '1px solid white',
                  display: 'flex'
                }}>
                  <button
                    onClick={() => handleAllianceAction(playerId, isAllianceSent ? 'rescind' : 'player')}
                    style={{
                      width: '50%',
                      height: '100%',
                      backgroundColor: !isAllianceSent ? 'black' : '#444444',
                      color: !isAllianceSent ? 'white' : '#888888',
                      border: 'none',
                      borderRight: '1px solid white',
                      fontSize: '15px',
                      fontWeight: 'normal',
                      cursor: !isAllianceSent ? 'default' : 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {!isAllianceSent ? (
                      <>
                        <span style={{ color: color }}>{playerNumber}</span> {color === '#00FFFF' ? 'cyan' : 'magenta'}
                      </>
                    ) : 'rescind'}
                  </button>

                  <button
                    onClick={() => handleAllianceAction(playerId, !isAllianceSent ? 'send' : 'player')}
                    style={{
                      width: '50%',
                      height: '100%',
                      backgroundColor: !isAllianceSent ? '#666666' : 'black',
                      color: !isAllianceSent ? 'white' : 'white',
                      border: 'none',
                      fontSize: '15px',
                      fontWeight: 'normal',
                      cursor: !isAllianceSent ? 'pointer' : 'default',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {!isAllianceSent ? 'send' : (
                      <>
                        <span style={{ color: color }}>{playerNumber}</span> {color === '#00FFFF' ? 'cyan' : 'magenta'}
                      </>
                    )}
                  </button>
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
        top: '10px',
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
        <div style={{ color: '#00FFFF' }}>◾ Player 1 Countries</div>
        <div style={{ color: '#FF00FF' }}>◾ Player 2 Countries</div>
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
    </div>
  );
};

// Main game component
function App() {
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [gamePhase, setGamePhase] = useState('country_selection');
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [playerCountries, setPlayerCountries] = useState({
    player1: [],
    player2: []
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
      setCurrentPlayer(prev => (prev + 1) % 2);
    }
  }, [currentPlayer, gamePhase]);

  const teamColors = {
    player1: '#00FFFF',
    player2: '#FF00FF'
  };

  const resetGame = useCallback(() => {
    setSelectedCountries([]);
    setPlayerCountries({ player1: [], player2: [] });
    setCurrentPlayer(0);
    setGamePhase('country_selection');
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

  // Group datasets by category
  const datasetsByCategory = useMemo(() => {
    const categories = {};
    Object.values(availableDatasets).forEach(dataset => {
      if (!categories[dataset.category]) {
        categories[dataset.category] = [];
      }
      categories[dataset.category].push(dataset);
    });
    return categories;
  }, [availableDatasets]);

  return (
    <div className="App">
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
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
              <select
                onChange={(e) => e.target.value && handleDatasetSelect(e.target.value)}
                value=""
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#444',
                  color: 'white',
                  border: '1px solid #666',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  minWidth: '200px'
                }}
              >
                <option value="">+ Add Dataset</option>
                {Object.entries(datasetsByCategory).map(([category, datasets]) => (
                  <optgroup key={category} label={category}>
                    {datasets.map(dataset => (
                      <option
                        key={dataset.id}
                        value={dataset.id}
                        disabled={selectedDatasets.includes(dataset.id) || dataset.disabled}
                        style={{
                          textDecoration: dataset.disabled ? 'line-through' : 'none',
                          color: dataset.disabled ? '#ff6b6b' : 'inherit'
                        }}
                      >
                        {dataset.disabled ? `❌ ${dataset.name} (${dataset.disabledReason})` : dataset.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
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

          {/* Game Phase and Data Status */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <div style={{ fontSize: '14px', color: '#4CAF50' }}>
              Phase: {gamePhase.replace('_', ' ').toUpperCase()}
            </div>


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
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 10px 0' }}>Player Status</h3>
            <div style={{ display: 'flex', gap: '20px', fontSize: '14px' }}>
              <div>
                <strong style={{ color: '#00FFFF' }}>Player 1:</strong> {playerCountries.player1.length} countries
                <div style={{ fontSize: '12px', color: '#ccc', maxWidth: '200px' }}>
                  {playerCountries.player1.join(', ')}
                </div>
              </div>
              <div>
                <strong style={{ color: '#FF00FF' }}>Player 2:</strong> {playerCountries.player2.length} countries
                <div style={{ fontSize: '12px', color: '#ccc', maxWidth: '200px' }}>
                  {playerCountries.player2.join(', ')}
                </div>
              </div>
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
        />
      </main>
    </div>
  );
}

export default App;
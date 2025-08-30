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

// Simple and efficient region boundary generator
const createRegionBoundaryData = (countries) => {
  const boundaries = [];
  
  // Create a map of regions to their country boundaries
  const regionBoundaryMap = new Map();
  
  countries.forEach(country => {
    const countryCode = getCountryCode(country);
    const region = REGION_MAPPING[countryCode];
    if (!region || region === 'n/a') return;
    
    if (!regionBoundaryMap.has(region)) {
      regionBoundaryMap.set(region, []);
    }
    
    // Add country boundary to region
    const processGeometry = (geometry) => {
      if (geometry.type === 'Polygon') {
        return geometry.coordinates.map(ring => ({
          coordinates: ring,
          country: countryCode,
          region: region
        }));
      } else if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.flatMap(polygon => 
          polygon.map(ring => ({
            coordinates: ring,
            country: countryCode,
            region: region
          }))
        );
      }
      return [];
    };
    
    const countryBoundaries = processGeometry(country.geometry);
    regionBoundaryMap.get(region).push(...countryBoundaries);
  });
  
  // Find boundaries between different regions
  const regions = Array.from(regionBoundaryMap.keys());
  const adjacencyMap = new Map();
  
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const region1 = regions[i];
      const region2 = regions[j];
      const boundaries1 = regionBoundaryMap.get(region1);
      const boundaries2 = regionBoundaryMap.get(region2);
      
      // Check for adjacency between regions
      let foundAdjacency = false;
      const adjacentSegments = [];
      
      boundaries1.forEach(boundary1 => {
        boundaries2.forEach(boundary2 => {
          // Check if boundaries share points (indicating adjacency)
          const coords1 = boundary1.coordinates;
          const coords2 = boundary2.coordinates;
          
          const sharedPoints = [];
          coords1.forEach(coord1 => {
            coords2.forEach(coord2 => {
              const distance = Math.sqrt(
                Math.pow(coord1[0] - coord2[0], 2) + 
                Math.pow(coord1[1] - coord2[1], 2)
              );
              if (distance < 0.01) { // Very close points
                sharedPoints.push(coord1);
              }
            });
          });
          
          if (sharedPoints.length >= 2) {
            foundAdjacency = true;
            adjacentSegments.push({
              coordinates: sharedPoints,
              regions: [region1, region2]
            });
          }
        });
      });
      
      if (foundAdjacency) {
        const key = [region1, region2].sort().join('-');
        adjacencyMap.set(key, adjacentSegments);
      }
    }
  }
  
  // Convert adjacency map to boundary lines
  Array.from(adjacencyMap.entries()).forEach(([key, segments]) => {
    segments.forEach((segment, index) => {
      if (segment.coordinates.length >= 2) {
        boundaries.push({
          coordinates: segment.coordinates,
          regions: segment.regions,
          id: `region_boundary_${key}_${index}`,
          type: 'region_boundary'
        });
      }
    });
  });
  
  return boundaries;
};

// Height calculation functions
const HEIGHT_GETTERS = {
  gdp: (feat) => feat.properties.GDP_MD_EST || feat.properties.GDP_MD || 0,
  area: (feat) => feat.properties.AREA || feat.properties.AREA_KM2 || 0,
  population: (feat) => feat.properties.POP_EST || feat.properties.POP2005 || 0,
  neighbors: (feat) => feat.properties.NEIGHBORS || feat.properties.NEIGHBOR_COUNT || 0,
  none: () => 0
};

const GlobeWrapper = ({ 
  selectedCountries = [], 
  onCountrySelect, 
  gamePhase, 
  currentPlayer,
  playerCountries = {},
  teamColors = {}
}) => {
  const [countries, setCountries] = useState({ features: [] });
  const [hoverD, setHoverD] = useState(null);
  const [heightFilter, setHeightFilter] = useState('none');
  const [regionBoundaries, setRegionBoundaries] = useState([]);
  
  // Memoized country region lookup
  const getCountryRegion = useCallback((country) => {
    const countryCode = getCountryCode(country);
    return REGION_MAPPING[countryCode] || 'n/a';
  }, []);
  
  // Memoized polygon data
  const polygonData = useMemo(() => 
    countries.features.length ? createPolygonData(countries.features) : [],
    [countries.features]
  );

  // Memoized max height value for normalization
  const maxHeightValue = useMemo(() => {
    if (!countries.features.length || heightFilter === 'none') return 1;
    const heightGetter = HEIGHT_GETTERS[heightFilter];
    return Math.max(...countries.features.map(heightGetter));
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

        const fixedData = rewind(
          { type: 'FeatureCollection', features: filtered },
          { reverse: true }
        );

        setCountries(fixedData);
        
        // Create region boundaries
        const boundaries = createRegionBoundaryData(filtered);
        setRegionBoundaries(boundaries);
      })
      .catch(err => {
        if (mounted) {
          console.error('Error loading countries:', err);
          setCountries({ features: [] });
        }
      });
    
    return () => { mounted = false; };
  }, []);

  // Optimized height function with additive hover effect
  const getPolygonHeight = useCallback((country) => {
    if (country.__layer === 'surface') return 0.00;
    
    const baseHeight = 0.005;
    const hoveredRegion = hoverD ? getCountryRegion(hoverD) : null;
    const countryRegion = getCountryRegion(country);
    
    let calculatedHeight = baseHeight;
    if (heightFilter !== 'none') {
      const heightGetter = HEIGHT_GETTERS[heightFilter];
      const value = heightGetter(country);
      calculatedHeight = (value / Math.max(maxHeightValue, 1)) * 0.5 + baseHeight;
    }
    
    // Additive hover effects instead of multiplicative
    if (hoveredRegion && countryRegion === hoveredRegion) {
      if (country === hoverD) {
        return calculatedHeight + 0.05; // Add 0.05 for direct hover
      } else {
        return calculatedHeight + 0.02; // Add 0.02 for region hover
      }
    }
    
    if (country === hoverD) {
      return calculatedHeight + 0.01; // Add 0.01 for direct hover when no region
    }
    
    return calculatedHeight;
  }, [hoverD, heightFilter, maxHeightValue, getCountryRegion]);

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

    const gdp = d.GDP_MD_EST || d.GDP_MD || 0;
    const pop = d.POP_EST || d.POP2005 || 0;
    const area = d.AREA || d.AREA_KM2 || 0;
    const neighbors = d.NEIGHBORS || d.NEIGHBOR_COUNT || 0;
    const name = d.NAME || d.ADMIN || 'Unknown';
    const code = getCountryCode({ properties: d });
    const region = REGION_MAPPING[code] || 'n/a';

    return `
      <div style="
        background: rgba(29, 29, 29, 0.8); 
        padding: 20px 16px; 
        color: white;
        clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
        position: relative;
        min-width: 140px;
        text-align: center;
        width: 160px !important;
        height: 185px !important;
      ">
        <div><b>${name} (${code})</b></div>
        <div>GDP: ${Math.round(gdp / 1000)}B$</div>
        <div>Area: ${Math.round(area / 1000)}K km²</div>
        <div>Population: ${Math.round(pop / 1000000)}M</div>
        <div>Neighbors: ${neighbors}</div>
        <div style="font-size: 10px; margin-top: 4px; opacity: 0.8;">
          Region: ${region.replace(/_/g, ' ')}
        </div>
      </div>
    `;
  }, []);

  // Height filter buttons data
   const heightFilterButtons = [
   { key: 'gdp', label: 'GDP' },
   { key: 'area', label: 'Area' },
   { key: 'population', label: 'Population' },
   { key: 'neighbors', label: 'Neighbors' }
  ] ;
 
// Add this state with your other useState hooks:
      const [allianceStates, setAllianceStates] = useState({
        player1: 'neutral',
        player2: 'neutral'
      });

      // Add this handler with your other functions:
      const handleAllianceAction = (playerId, action) => {
        setAllianceStates(prev => ({
          ...prev,
          [playerId]: action === 'send' ? (prev[playerId] === 'neutral' ? 'sent' : 'neutral') : 'neutral'
        }));
      };


  return (
    <div style={{ position: 'relative', width: '100%', height: '600px' }}>
      <Globe
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        lineHoverPrecision={0}
        
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
      
       {/* Status Panel */}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '10px',
          borderRadius: '5px',
          fontSize: '14px',
          zIndex: 100
        }}>
          <div><strong>Phase:</strong> {gamePhase.replace('_', ' ').toUpperCase()}</div>
          {currentPlayer !== undefined && gamePhase === 'country_selection' && (
            <div><strong>Current Player:</strong> {currentPlayer + 1}</div>
          )}
          {hoverD && (
            <div><strong>Region:</strong> {getCountryRegion(hoverD).replace('_', ' ')}</div>
          )}
          <div><strong>Region Boundaries:</strong> {regionBoundaries.length}</div>
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
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                color: 'white',
                border: heightFilter === key ? '2px solid white' : '1px solid rgba(255, 255, 255, 0.5)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: heightFilter === key ? 'bold' : 'normal',
                transition: 'all 0.2s ease'
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Alliance Panel */}
        <div style={{
          width: '358px', // Match the approximate width of the buttons above
          backgroundColor: 'black',
          border: '2px solid white'
        }}>
          {/* Alliance Header */}
          <div style={{
            backgroundColor: '#252525',
            color: 'white',
            padding: '8px',
            textAlign: 'center',
            fontSize: '14px',
            fontWeight: 'bold',
            border: '1px solid white',
            borderBottom: '2px solid white'
          }}>
            Alliances
          </div>
          
          {/* Team Sections */}
          <div style={{ padding: '8px 20px' }}>
            {Object.entries(teamColors).map(([playerId, color]) => {
              const playerNumber = playerId.replace('player', '');
              const allianceState = allianceStates[playerId] || 'neutral';
              
              return (
                <div key={playerId} style={{
                  position: 'relative',
                  marginBottom: '8px',
                  height: '32px',
                  border: '1px solid white',
                  display: 'flex'
                }}>
                  {/* Rescind Button - Always greyed out */}
                  <button 
                    onClick={() => handleAllianceAction(playerId, 'rescind')}
                    style={{
                      width: '50%',
                      height: '100%',
                      backgroundColor: '#444444',
                      color: '#888888',
                      border: '1px solid white',
                      borderRight: '1px solid white',
                      fontSize: '11px',
                      cursor: 'pointer',
                      opacity: 0.7
                    }}
                  >
                    RESCIND
                  </button>

                  {/* Team Name - slides between halves */}
                  <div style={{
                    position: 'absolute',
                    left: allianceState === 'sent' ? '0%' : '50%',
                    top: '0',
                    width: '50%',
                    height: '100%',
                    backgroundColor: 'black',
                    color: color,
                    border: '1px solid white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    zIndex: 102,
                    pointerEvents: 'none',
                    transition: 'left 0.3s ease'
                  }}>
                    PLAYER {playerNumber}
                  </div>

                  {/* Send Button */}
                  <button 
                    onClick={() => handleAllianceAction(playerId, 'send')}
                    style={{
                      width: '50%',
                      height: '100%',
                      backgroundColor: '#666666',
                      color: 'white',
                      border: '1px solid white',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    SEND
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    
      {/* Legend */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        backgroundColor: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px',
        zIndex: 100,
        maxWidth: '200px'
      }}>
        <div><strong>Legend:</strong></div>
        <div>Height: {heightFilter === 'none' ? 'Flat' : heightFilter.toUpperCase()}</div>
        <div style={{ color: '#00FFFF' }}>◾ Player 1 Countries</div>
        <div style={{ color: '#FF00FF' }}>◾ Player 2 Countries</div>
        <div style={{ color: '#FFFFFF' }}>━ Region Boundaries</div>
        <div style={{ marginTop: '5px', fontSize: '11px' }}>
          Hover: Region highlights<br/>
          Click: Select country
          {heightFilter !== 'none' && (
            <div style={{ marginTop: '3px', fontStyle: 'italic' }}>
              Transparent sides for visibility
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

  return (
    <div className="App">
      <header style={{ padding: '20px', backgroundColor: '#282c34', color: 'white' }}>
        <div style={{ 
          display: 'flex', 
          gap: '20px', 
          marginTop: '20px',
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
        />
      </main>
    </div>
  );
}

export default App;
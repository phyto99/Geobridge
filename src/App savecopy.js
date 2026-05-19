
import React, { useEffect, useState, useMemo } from 'react';
import Globe from 'react-globe.gl';
import { scaleSequentialSqrt } from 'd3-scale';
import { interpolateYlOrRd } from 'd3-scale-chromatic';
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
  west_europe: ['GB', 'IE', 'NL', 'BE', 'LU', 'MC', '-99'],
  north_europe: ['DK', 'IS', '-99', 'SE', 'FI'],
  southeast_europe: ['AL', 'BA', 'HR', 'MK', 'ME', 'RS', 'RO', 'BG', 'XK'], // missing 2?
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
    'IL', 'JO', 'SA', 'YE', 'OM', 'BH', 'QA', 'AE', 'KW', 'PS' // why is ps not on the other list
  ],
  indian_subcontinent: ['IN', 'AF', 'PK', 'NP', 'BD', 'BT', 'LK'],
  central_asia: ['KZ', 'UZ', 'TM', 'TJ', 'KG'], 
  eastern_asia: [
    'CN', 'KP', 'KR', 'JP', 'MM', 'TH', 'KH', 'VN', 'LA', 
    'ID', 'PH', 'PG', 'MY', 'CN-TW', 'MN'
  ],  // missing 2?

  oceania: ['AU', 'NZ', 'FJ', 'VU', 'SB', 'PW', 'NR', 'MH', 'WS', 'TO', 'KI'],
  antarctica: ['AQ']
};
// Create the lookup mapping from the grouped data
const REGION_MAPPING = Object.entries(REGIONS).reduce((acc, [region, countries]) => {
  countries.forEach(country => {
    acc[country] = region;
  });
  return acc;
}, {});

// Simple and efficient region boundary generator
const createRegionBoundaryData = (countries) => {
  const regionBoundaries = [];
  
  // Process each country to create region-specific boundaries
  countries.forEach(country => {
    const countryCode = country.properties?.ISO_A2 || country.properties?.ISO_A3;
    const region = REGION_MAPPING[countryCode];
    
    if (!region || region === 'n/a') return;
    
    // Create boundary polygons for each country, tagged with region info
    const processGeometry = (geometry) => {
      if (geometry.type === 'Polygon') {
        return [{
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: geometry.coordinates[0] // Outer ring only
          },
          properties: {
            region: region,
            country: countryCode,
            boundaryType: 'region'
          }
        }];
      } else if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.map((polygon, index) => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: polygon[0] // Outer ring of each polygon
          },
          properties: {
            region: region,
            country: countryCode,
            boundaryType: 'region',
            polygonIndex: index
          }
        }));
      }
      return [];
    };
    
    const boundaries = processGeometry(country.geometry);
    regionBoundaries.push(...boundaries);
  });
  
  return regionBoundaries;
};

// Updated GlobeWrapper component with the new boundary system
const GlobeWrapper = ({ 
  selectedCountries = [], 
  onCountrySelect, 
  gamePhase, 
  currentPlayer,
  playerCountries = {},
  teamColors = {}
}) => {
  const [countries, setCountries] = useState({ features: [] });
  const [hoverD, setHoverD] = useState();
  const [heightFilter, setHeightFilter] = useState('none');
  const [regionBoundaries, setRegionBoundaries] = useState([]);
  
  // Get region for a country
  const getCountryRegion = (country) => {
    const countryCode = country.properties?.ISO_A2 || country.properties?.ISO_A3;
    return REGION_MAPPING[countryCode] || 'n/a';
  };
  
  // Create multi-layer polygon data
  const polygonData = useMemo(() => {
    if (!countries.features.length) return [];
    
    const surfaceOutlines = countries.features.map(feature => ({
      ...feature,
      __layer: 'surface',
      __id: `surface_${feature.properties.ISO_A2 || feature.properties.ISO_A3 || Math.random()}`
    }));
    
    const elevatedCountries = countries.features.map(feature => ({
      ...feature,
      __layer: 'elevated',
      __id: `elevated_${feature.properties.ISO_A2 || feature.properties.ISO_A3 || Math.random()}`
    }));
    
    return [...surfaceOutlines, ...elevatedCountries];
  }, [countries]);

  // Alternative approach: Use the existing country outlines but filter by region adjacency
  const optimizedRegionBoundaries = useMemo(() => {
    if (!countries.features.length) return [];
    
    const boundaries = [];
    
    // Create a map of regions to their country boundaries
    const regionBoundaryMap = new Map();
    
    countries.features.forEach(country => {
      const region = getCountryRegion(country);
      if (region === 'n/a') return;
      
      if (!regionBoundaryMap.has(region)) {
        regionBoundaryMap.set(region, []);
      }
      
      // Add country boundary to region
      const processGeometry = (geometry) => {
        if (geometry.type === 'Polygon') {
          return geometry.coordinates.map(ring => ({
            coordinates: ring,
            country: country.properties?.ISO_A2 || country.properties?.ISO_A3,
            region: region
          }));
        } else if (geometry.type === 'MultiPolygon') {
          return geometry.coordinates.flatMap(polygon => 
            polygon.map(ring => ({
              coordinates: ring,
              country: country.properties?.ISO_A2 || country.properties?.ISO_A3,
              region: region
            }))
          );
        }
        return [];
      };
      
      const countryBoundaries = processGeometry(country.geometry);
      regionBoundaryMap.get(region).push(...countryBoundaries);
    });
    
    // Now find boundaries between different regions
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
  }, [countries]);

  // Load countries data and create boundaries -- Filtered Contries here
  useEffect(() => {
    fetch('/data/polygons.geojson')
     .then(res => res.json())
      .then(data => {
        // countries by themselves Singapore, Brunei, Vatican, Timor-Leste, New Caledonia, Hong Kong, Puerto Rico, Trinidad and Tobago  
       const excluded = new Set(['MU', 'JE', 'GG', 'IM', 'FO', 'AX', 'PM', 'CV', 'GS', 'MV', 'IO', 'MP', 'FM', 
        'SC', 'NF', 'ST', 'SH', 'BM', 'TV', 'AS', 'NU', 'CK', 'PF', 'PN', 'WF', 'TC', 'KY', 'AW', 'CW', 'VI', 'VG', 'AI', 'MF', 'SX', 'BL', 'MS', 'HM', 'TF', 'GL']); // <-- Put exclusions here
       const filtered = data.features.filter(f =>
          !excluded.has(f.properties?.ISO_A2 || f.properties?.ISO_A3 || '')
        );

        const fixedData = rewind(
         { type: 'FeatureCollection', features: filtered },
         { reverse: true }
       );

       setCountries(fixedData);

        const boundaries = createRegionBoundaryData(filtered);
       setRegionBoundaries(boundaries);
      })
     .catch(err => {
       console.error('Error loading countries:', err);
        setCountries({ features: [] });
      });
  }, []);

  // Height calculation based on filter
  const getHeightValue = (feat) => {
    switch (heightFilter) {
      case 'gdp':
        return feat.properties.GDP_MD_EST || feat.properties.GDP_MD || 0;
      case 'area':
        return feat.properties.AREA || feat.properties.AREA_KM2 || 0;
      case 'population':
        return feat.properties.POP_EST || feat.properties.POP2005 || 0;
      case 'neighbors':
        return feat.properties.NEIGHBORS || feat.properties.NEIGHBOR_COUNT || 0;
      default:
        return 0;
    }
  };

  // Calculate max value for normalization
  const maxHeightValue = useMemo(() => {
    if (!countries.features.length || heightFilter === 'none') return 1;
    return Math.max(...countries.features.map(getHeightValue));
  }, [countries, heightFilter]);

  // Height function with regional elevation
  const getPolygonHeight = (country) => {
    if (country.__layer === 'surface') {
      return 0.00; // Black layer at surface (0.00)
    }
    
    const baseHeight = 0.005; // Grey layer at 0.005
    const hoveredRegion = hoverD ? getCountryRegion(hoverD) : null;
    const countryRegion = getCountryRegion(country);
    
    // Calculate base height from filter
    let calculatedHeight = baseHeight;
    if (heightFilter !== 'none') {
      const value = getHeightValue(country);
      calculatedHeight = (value / Math.max(maxHeightValue, 1)) * 0.45 + baseHeight;
    }
    
    // Regional elevation logic
    if (hoveredRegion && countryRegion === hoveredRegion) {
      if (country === hoverD) {
        return calculatedHeight * 10;
      } else {
        return calculatedHeight * 4;
      }
    }
    
    return country === hoverD ? calculatedHeight * 2 : calculatedHeight;
  };

  // Color function
  const getCountryColor = (country) => {
    if (country.__layer === 'surface') {
      return 'transparent'; // Black outlines only, no fill
    }
    
    const countryCode = country.properties.ISO_A2 || country.properties.ISO_A3;
    
    // Player colors
    for (const [playerId, playerCountryList] of Object.entries(playerCountries)) {
      if (playerCountryList.includes(countryCode)) {
        return teamColors[playerId] || '#666666';
      }
    }
    
    // Regional highlighting
    const hoveredRegion = hoverD ? getCountryRegion(hoverD) : null;
    const countryRegion = getCountryRegion(country);

    if (country === hoverD) {
      return 'rgba(255, 255, 255, 0.5)';
    }

    if (hoveredRegion && countryRegion === hoveredRegion) {
      return 'rgba(80, 80, 80, 0.5)';
    }
    
    return 'rgba(0, 0, 0, 0)';
  };

  // Stroke color function
  const getStrokeColor = (country) => {
    if (country.__layer === 'surface') {
      return '#000000'; // Black outlines at surface
    }
    return '#666666'; // Grey outlines for elevated layer
  };

  // Side color function
  const getSideColor = (country) => {
    if (country.__layer === 'surface') {
      return 'transparent';
    }
    const hoveredRegion = hoverD ? getCountryRegion(hoverD) : null;
    const countryRegion = getCountryRegion(country);
    if (hoveredRegion && countryRegion === hoveredRegion) {
      return 'rgba(255, 255, 255, 1)'; 
    }
    return country === hoverD ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 0, 0, 0)'; 
  };

  const handleCountryClick = (country) => {
    if (onCountrySelect && gamePhase === 'country_selection' && country.__layer === 'elevated') {
      const countryCode = country.properties.ISO_A2 || country.properties.ISO_A3;
      
      if (!countryCode) {
        console.log('No country code found for:', country.properties);
        return;
      }
      
      const isAlreadySelected = Object.values(playerCountries)
        .some(playerCountryList => playerCountryList.includes(countryCode));
      
      if (!isAlreadySelected) {
        onCountrySelect(countryCode);
      }
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '600px' }}>
      <Globe
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        lineHoverPrecision={0}
        
        // Polygons (countries)
        polygonsData={polygonData}
        polygonAltitude={getPolygonHeight}
        polygonCapColor={getCountryColor}
        polygonSideColor={getSideColor}
        polygonStrokeColor={getStrokeColor}
        polygonLabel={({ properties: d, __layer }) => {
          if (__layer === 'surface') return '';
  
         const gdp = d.GDP_MD_EST || d.GDP_MD || 0;
         const pop = d.POP_EST || d.POP2005 || 0;
         const area = d.AREA || d.AREA_KM2 || 0;
         const neighbors = d.NEIGHBORS || d.NEIGHBOR_COUNT || 0;
         const name = d.NAME || d.ADMIN || 'Unknown';
         const code = d.ISO_A2 || d.ISO_A3 || '??';
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
        }}
        onPolygonHover={(country) => {
          if (!country || country.__layer === 'elevated') {
            setHoverD(country);
          }
        }}
        onPolygonClick={handleCountryClick}
        polygonsTransitionDuration={300}
        
        // Region boundary lines 
        pathsData={optimizedRegionBoundaries}
        pathPoints={(d) => d.coordinates}
        pathPointLat={(point) => point[1]}
        pathPointLng={(point) => point[0]}
        pathColor={() => '#FFFFFF'} // White lines
        pathStroke={2}
        pathDashLength={0}
        pathDashGap={0}
        pathAltitude={0.015} // higher altitude - didn't work
        pathResolution={2}
        pathTransitionDuration={0}
      />
      
      {/* Rest of your UI components remain the same */}
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
        <div><strong>Region Boundaries:</strong> {optimizedRegionBoundaries.length}</div>
        <div><strong>Layer Heights:</strong> Black(0.00) → Grey(0.005) → White(0.015)</div>
      </div>
      
      {/* Height Filter Buttons */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        flexDirection: 'row',
        gap: '8px',
        zIndex: 100
      }}>
        {[
          { key: 'gdp', label: 'GDP' },
          { key: 'area', label: 'Area' },
          { key: 'population', label: 'Population' },
          { key: 'neighbors', label: 'Neighbors' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setHeightFilter(heightFilter === key ? 'none' : key)}
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              color: 'white',
              border: heightFilter === key ? '2px solid white' : '1px solid rgba(255, 255, 255, 0.5)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: heightFilter === key ? 'bold' : 'normal',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (heightFilter !== key) {
                e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.8)';
              }
            }}
            onMouseLeave={(e) => {
              if (heightFilter !== key) {
                e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)';
              }
            }}
          >
            {label}
          </button>
        ))}
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
          Click: Select country<br/>
          Layers: Black(surface) → Grey(0.005) → White(0.015)
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

  const handleCountrySelect = (countryCode) => {
    console.log('Country selected:', countryCode);
    
    setSelectedCountries(prev => [...prev, countryCode]);
    
    const playerKey = `player${currentPlayer + 1}`;
    setPlayerCountries(prev => ({
      ...prev,
      [playerKey]: [...prev[playerKey], countryCode]
    }));
    
    if (gamePhase === 'country_selection') {
      setCurrentPlayer(prev => (prev + 1) % 2);
    }
  };

  const teamColors = {
    player1: '#00FFFF',
    player2: '#FF00FF'
  };

  const resetGame = () => {
    setSelectedCountries([]);
    setPlayerCountries({ player1: [], player2: [] });
    setCurrentPlayer(0);
    setGamePhase('country_selection');
  };

  return (
    <div className="App">
      <header style={{ padding: '20px', backgroundColor: '#282c34', color: 'white' }}>
        <h1>Geobridge - Interactive Globe Game</h1>
        
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
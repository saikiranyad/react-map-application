import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import "leaflet/dist/leaflet.css";
import "./map.css";

const RecentMap = ({ coords, destination }) => {
  const map = useMap();
  useEffect(() => {
    if (destination) map.flyTo(destination, 16, { animate: true, duration: 2.5 });
    else if (coords) map.flyTo(coords, 16, { animate: true, duration: 2.5 });
  }, [coords, destination, map]);
  return null;
};

const MapClickHandler = ({ setClickedLocation, setLocation }) => {
  const map = useMap();

  useEffect(() => {
    const handleClick = async (e) => {
      const latlng = [e.latlng.lat, e.latlng.lng];
      setClickedLocation(latlng);

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng[0]}&lon=${latlng[1]}`);
        const data = await res.json();
        if (data.display_name) setLocation(data.display_name);
      } catch (err) {
        console.error("Reverse geocoding error:", err);
      }
    };

    map.on("click", handleClick);
    return () => map.off("click", handleClick);
  }, [map, setClickedLocation, setLocation]);

  return null;
};

const NewMap = () => {
  const [coords, setCoords] = useState(null);
  const [location, setLocation] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [destination, setDestination] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [animatedRoute, setAnimatedRoute] = useState([]);
  const [rideActive, setRideActive] = useState(false);
  const [showRecenter, setShowRecenter] = useState(false);
  const [btnPos, setBtnPos] = useState({ x: 20, y: 20 });
  const draggingRef = useRef(false);
  const mapRef = useRef();
  const [mapStyle, setMapStyle] = useState("osm");
  const [clickedLocation, setClickedLocation] = useState(null);
  const markerRef = useRef();

  const mapTiles = {
    osm: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: '&copy; OpenStreetMap contributors' },
    satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: 'Tiles &copy; Esri' },
    terrain: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attribution: '&copy; OpenTopoMap contributors' }
  };

  const userIcon = new L.Icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/149/149071.png", iconSize: [25, 25] });
  const destinationIcon = new L.Icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png", iconSize: [40, 40] });

  // Watch user location
  useEffect(() => {
    const watcher = navigator.geolocation.watchPosition(
      async (pos) => {
        const newCoords = [pos.coords.latitude, pos.coords.longitude];

        // Smoothly move marker
        if (markerRef.current) markerRef.current.setLatLng(newCoords);
        setCoords(newCoords);

        // Update route
        if (destination) {
          try {
            const res = await fetch(
              `https://router.project-osrm.org/route/v1/driving/${newCoords[1]},${newCoords[0]};${destination[1]},${destination[0]}?overview=full&geometries=geojson`
            );
            const data = await res.json();
            if (data.routes?.length) {
              const route = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
              setRouteCoords(route);
              setRideActive(true);
              if (mapRef.current) mapRef.current.fitBounds(L.latLngBounds(route));

              // Animate route drawing
              if (animatedRoute.length === 0) {
                setAnimatedRoute([newCoords]);
              } else {
                const lastPoint = animatedRoute[animatedRoute.length - 1];
                const nextPoints = route.slice(route.findIndex(p => p[0] === lastPoint[0] && p[1] === lastPoint[1]));
                if (nextPoints.length > 0) setAnimatedRoute(prev => [...prev, nextPoints[0]]);
              }
            }
          } catch (err) {
            console.error("Error updating route:", err);
          }
        }
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watcher);
  }, [destination, animatedRoute]);

  // Search suggestions
  useEffect(() => {
    if (!location) return setSuggestions([]);
    const fetchSuggestions = async () => {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${location}&limit=5`);
      const data = await res.json();
      setSuggestions(data);
    };
    const delay = setTimeout(fetchSuggestions, 500);
    return () => clearTimeout(delay);
  }, [location]);

  const handleSuggestionClick = (s) => {
    const newCoords = [parseFloat(s.lat), parseFloat(s.lon)];
    setDestination(newCoords);
    setLocation(s.display_name);
    setShowSuggestions(false);
    setSuggestions([]);
    setAnimatedRoute([]); // reset animated route
  };

  const handleSelectDestination = (e) => {
    const value = e.target.value;
    if (value === "current") setDestination(null);
    else {
      const selected = suggestions.find(s => s.place_id.toString() === value);
      if (selected) setDestination([parseFloat(selected.lat), parseFloat(selected.lon)]);
    }
    setShowSuggestions(false);
    setAnimatedRoute([]); // reset animated route
  };

  const handleDragStart = () => draggingRef.current = true;
  const handleDrag = (e) => {
    if (!draggingRef.current) return;
    setBtnPos({ x: btnPos.x + e.movementX, y: btnPos.y + e.movementY });
  };
  const handleDragEnd = () => draggingRef.current = false;

  const showRoute = async () => {
    if (!coords || !destination) return;
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords[1]},${coords[0]};${destination[1]},${destination[0]}?overview=full&geometries=geojson`);
    const data = await res.json();
    if (data.routes?.length) {
      const route = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      setRouteCoords(route);
      setAnimatedRoute([coords]); // start animated route
      setRideActive(true);
      if (mapRef.current) mapRef.current.fitBounds(L.latLngBounds(route));
    }
  };

  const cancelRide = () => { setRideActive(false); setRouteCoords([]); setDestination(null); setLocation(""); setAnimatedRoute([]); };
  const recenterToUser = () => { if (mapRef.current && coords) mapRef.current.flyTo(coords, 16, { animate: true, duration: 1.8 }); };

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    let timeout;
    const showButton = () => {
      setShowRecenter(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowRecenter(false), 5000);
    };
    map.on("dragstart zoomstart", showButton);
    timeout = setTimeout(() => setShowRecenter(false), 5000);
    return () => { map.off("dragstart zoomstart", showButton); clearTimeout(timeout); };
  }, [mapRef.current]);

  return (
    <div style={{ padding: "10px", position: "relative" }}>
      <div style={{ marginBottom: "10px" }}>
        <select value={mapStyle} onChange={(e) => setMapStyle(e.target.value)} style={{ padding: "8px", borderRadius: "6px" }}>
          <option value="osm">OpenStreetMap</option>
          <option value="satellite">Satellite</option>
          <option value="terrain">Terrain</option>
        </select>
      </div>

      <AnimatePresence>
        {!rideActive && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}>
            <input type="text" placeholder="Enter location..." value={location} onChange={e => { setLocation(e.target.value); setShowSuggestions(true); }} style={{ padding: "8px", width: "300px", marginBottom: "5px", borderRadius: "6px", border: "1px solid #ccc" }} />
            {showSuggestions && location && suggestions.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ border: "1px solid #ccc", width: "300px", maxHeight: "150px", overflowY: "auto", background: "#fff", borderRadius: "6px" }}>
                {suggestions.map(s => <div key={s.place_id} style={{ padding: "5px", cursor: "pointer" }} onClick={() => handleSuggestionClick(s)}>{s.display_name}</div>)}
              </motion.div>
            )}
            <div style={{ marginTop: "10px" }}>
              <select onChange={handleSelectDestination} style={{ padding: "8px", width: "300px", borderRadius: "6px", border: "1px solid #ccc" }}>
                {coords && <option value="current">📍 Your Current Location</option>}
                {suggestions.map(s => <option key={s.place_id} value={s.place_id}>{s.display_name}</option>)}
              </select>
            </div>
            <motion.button onClick={showRoute} style={{ marginTop: "10px", padding: "8px 12px", background: "#28a745", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>Show Route</motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {rideActive && <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
        <motion.button onClick={cancelRide} style={{ marginTop: "10px", padding: "8px 12px", background: "#dc3545", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>Cancel Ride</motion.button>
      </motion.div>}

      {coords && (
        <div style={{ position: "relative", marginTop: "15px" }}>
          <MapContainer center={coords} zoom={13} style={{ height: "80vh", width: "100%", borderRadius: "8px" }} whenCreated={mapInstance => mapRef.current = mapInstance}>
            <TileLayer url={mapTiles[mapStyle].url} attribution={mapTiles[mapStyle].attribution} />
            <RecentMap coords={coords} destination={destination || coords} />
            <MapClickHandler setClickedLocation={setClickedLocation} setLocation={setLocation} />

            <Marker ref={markerRef} position={coords} icon={userIcon}><Popup>Your Location</Popup></Marker>
            {destination && <Marker position={destination} icon={destinationIcon}><Popup>{location}</Popup></Marker>}
            {clickedLocation && (
              <Marker position={clickedLocation}>
                <Popup>
                  Clicked: {clickedLocation[0].toFixed(5)}, {clickedLocation[1].toFixed(5)}
                  <br />
                  <button onClick={() => setDestination(clickedLocation)}>Set as Destination</button>
                </Popup>
              </Marker>
            )}

            {animatedRoute.length > 0 && <Polyline positions={animatedRoute} color="blue" weight={5} />}
          </MapContainer>

          <AnimatePresence>
            {showRecenter && (
              <motion.button key="recenter-btn" onClick={() => { recenterToUser(); setShowRecenter(false); }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.5 }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} className="pulse-btn" style={{ left: btnPos.x, top: btnPos.y }} onMouseDown={handleDragStart} onMouseMove={handleDrag} onMouseUp={handleDragEnd}>📍</motion.button>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default NewMap;

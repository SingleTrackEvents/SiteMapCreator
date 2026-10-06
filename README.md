# Site Map Creator

Draw event villages, aid stations and safety infrastructure over satellite imagery, then print a clean site map for permits and council.

Built for the SingleTrack Events ops team. This is the Stage 1 prototype: one person edits a map at a time, and maps are saved as files you can share through Drive or email.

## Getting started

No install needed. Run a small local web server from this folder and open it in Chrome or Edge:

```
npx http-server -p 8080
```

Then open http://localhost:8080.

You can also double-click `index.html`, but a local server is more reliable. Imagery, the icon library and venue search all need an internet connection.

## How it works

1. **Find the venue.** Type a place in the search box, for example "Pioneer Park Bright".
2. **Pick your imagery.** Vicmap Aerial is the sharpest in Victoria and NSW Imagery is the sharpest in NSW. Esri World Imagery covers everywhere else. Tick **Roads** to add road names over the top.
3. **Bring in the course.** File, then Import course GPX. Each track becomes a course line with its length shown.
4. **Lay out the site.** Choose an item from the library on the left, then click the map.
   - Marquees, the stage, containers, toilet blocks and food vans are drawn **to real size**. Set width, length and rotation in the panel on the right.
   - Symbols (aid stations, first aid, toilets, marshals and so on) drop where you click. Hold **Shift** to place several in a row.
   - Lines (fencing, emergency routes) and areas (parking, event village, restricted zones): click to add points, then click the last point or press **Enter** to finish.
5. **Fill in the details.** Click anything to give it a label, notes or a different colour (handy for colouring each race distance differently). Coordinates, lengths and areas are shown for you.
6. **Set the event details.** Click the event name at the top. These go in the title block on the printed map.
7. **Print.** Click **Print layout**, choose A3 or A4 and the orientation, frame the map, then **Print / Save as PDF**. In the print dialog choose "Save as PDF" and make sure margins are set to "None" if asked.

Layers you switch off at the bottom are left off the print, so you can make a council version and a volunteer version from the same map.

## Saving your work

- Your current map is kept in the browser automatically, so a refresh will not lose it.
- Use **File, Save map file** (or Ctrl+S) to save a `.sitemap.json` file. Keep these in the shared Drive folder for each event. Open them again with **File, Open map file**.
- **File, Export GeoJSON** gives you a file that opens in Google Earth Pro, QGIS and most mapping tools.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Esc | Cancel placing, or deselect |
| Enter | Finish drawing a line or area |
| Delete | Delete the selected item |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+D | Duplicate the selected item |
| [ and ] | Rotate a marquee 15° (hold Shift for 5°) |
| Ctrl+S | Save map file |

## Imagery and attribution

- Vicmap Aerial and road labels: © State of Victoria, Department of Transport and Planning (CC BY 4.0)
- NSW Imagery: © Spatial Services NSW (CC BY 4.0)
- Esri World Imagery: © Esri, Maxar, Earthstar Geographics
- Street map: © OpenStreetMap contributors
- Venue search: Nominatim, © OpenStreetMap contributors

The printed map includes the right attribution automatically.

## Project layout

```
index.html        page structure
css/app.css       styles, including the print layout
js/catalogue.js   item library (types, colours, sizes) and imagery sources
js/geo.js         distance, area and to-scale shape helpers
js/app.js         the app itself
```

To add a new item to the library, add a line to `SMC.TYPES` in `js/catalogue.js`.

## What's next (Stage 2 ideas)

- Aid stations snapped to the course with automatic km distances
- An equipment list generated from the map (marquees, toilets, metres of fencing)
- Venue templates to start next year's map from this year's

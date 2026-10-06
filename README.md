# Site Map Creator

Draw event villages, aid stations and safety infrastructure over satellite imagery, then print a clean site map for permits and council.

Built for the SingleTrack Events ops team. This is a prototype (Stages 1 and 2): one person edits a map at a time, and maps are saved as files you can share through Drive or email.

## Getting started

**Online:** open https://singletrackevents.github.io/SiteMapCreator/ in Chrome or Edge. Nothing to install.

**Offline copy:** no install and no code needed.

1. Download the project as a zip file. On the GitHub page, click the green **Code** button, then **Download ZIP**.
2. Unzip it (double-click the zip file on a Mac, or right-click and choose **Extract All** on Windows).
3. Open the unzipped folder and double-click **index.html**. It opens in your web browser and you're ready to go.

Chrome or Edge work best. You'll need an internet connection for the imagery and venue search.

Your work is kept in that browser on that computer, so use **File, Save map file** to keep a copy you can share or open somewhere else.

## How it works

1. **Find the venue.** Type a place in the search box, for example "Pioneer Park Bright".
2. **Pick your imagery.** Vicmap Aerial is the sharpest in Victoria and NSW Imagery is the sharpest in NSW. Esri World Imagery covers everywhere else. Tick **Roads** to add road names over the top.
3. **Bring in the course.** File, then Import course GPX. Each track becomes a course line with its length shown. Or bring in a whole Google My Maps map (see below).
4. **Lay out the site.** Choose an item from the library on the left, then click the map.
   - Marquees, the stage, containers, toilet blocks and food vans are drawn **to real size**. Set width, length and rotation in the panel on the right.
   - Symbols (aid stations, first aid, toilets, marshals and so on) drop where you click. Hold **Shift** to place several in a row.
   - Lines (fencing, emergency routes) and areas (parking, event village, restricted zones): click to add points, then click the last point or press **Enter** to finish.
5. **Fill in the details.** Click anything to give it a label, notes or a different colour (handy for colouring each race distance differently). Coordinates, lengths and areas are shown for you.
6. **Set the event details.** Click the event name at the top. These go in the title block on the printed map.
7. **Print.** Click **Print layout**, choose A3 or A4 and the orientation, frame the map, then **Print / Save as PDF**. In the print dialog choose "Save as PDF" and make sure margins are set to "None" if asked.

Layers you switch off at the bottom are left off the print, so you can make a council version and a volunteer version from the same map.

## Importing from Google My Maps

Already have the event in Google My Maps? Bring the lot across in one go.

1. In My Maps, click **Share** and turn on **Anyone with this link can view**.
2. Copy the link from your browser's address bar (it contains `mid=`).
3. Here, choose **File, Import from Google My Maps**, paste the link and click **Load map**.
4. Untick any folders you don't want (folders with "old" in the name start unticked), then click **Import**.

Each pin, line and shape is matched to the closest item type by its name, for example "Doongalla Aid Station" becomes an aid station and "Marshal #3" becomes a marshal point. Courses keep their My Maps colours, and descriptions come across as notes. Anything that can't be matched becomes a plain map pin, and you can change its type by clicking it.

Prefer not to share the map? In My Maps use the three-dot menu, **Export to KML/KMZ**, and choose that file in the import window instead.

## Course distances and aid stations

- Any point within 100 m of a course line shows how far along the course it is, for every course it sits on. Loop courses show each pass, for example "17.9 / 27.1 km".
- Tick **Show km on the map label** to print the distance next to the name.
- Aid stations and water stations have a lead contact, a cut-off time and a checklist of services (water, food, medical, drop bags and so on). Marshals and other aid points have a lead and cut-off.

## Lists

Click **Lists** at the top for:

- **Equipment list:** a count of everything on the map (marquees by size, toilets, metres of fencing and so on). Layers you've switched off are left out.
- **Course points:** for each course, every aid station, marshal, timing point and safety point in km order, with leads, cut-offs and services.

Both can be printed or downloaded as a spreadsheet (CSV).

## Sharing a finished plan

Click **Share** at the top to get a view-only link, then click **Copy link** and paste it into an email, Slack, WhatsApp, Teams or a Google Doc.

People who open the link can:

- see the map on satellite imagery, on a computer or phone
- switch layers on and off, and click anything for details (leads, cut-offs, services, km on each course, notes)
- open any point in Google Maps for directions
- view the lists, and click **Download PDF** to print or save the map

They can't change your map. If they need to, **Edit a copy** turns it into their own editable map in their browser.

Good to know:

- The whole map is packed inside the link, so nothing is stored online. That's why the link is long (about 9,000 characters for a full event). It's fine for email and chat apps but too long for a text message.
- A link is a snapshot. If you change the map, share a new link.
- Anyone who has the link can see the map, so share it the way you'd share the PDF.

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
js/geo.js         distance, area, to-scale shape and along-course helpers
js/kml.js         Google My Maps and KML/KMZ import
js/reports.js     equipment list and course points
js/app.js         the app itself
```

To add a new item to the library, add a line to `SMC.TYPES` in `js/catalogue.js`.

When you change any CSS or JS file, bump the `?v=` number on every file in `index.html`. Browsers keep copies of these files, and without the bump someone can end up with the new page and an old script, which breaks menus and buttons.

## What's next

- Venue templates to start next year's map from this year's
- One-page aid station sheets with a zoomed map and access directions
- Shared online maps so the team can open the same map without passing files around

import { describe, it, expect } from 'vitest'
import {
  extractLatLngFromUrl,
  parseGeoJSON,
  parseCsv,
  splitCsvLine,
  dedupePlaces,
  parsePlacesFile,
  clampTitle,
  clampUrl,
  validCoords,
} from './importPlaces'

describe('extractLatLngFromUrl', () => {
  it('prefers the !3d!4d place marker', () => {
    const url = 'https://www.google.com/maps/place/Blue+Bottle/@37.5,-122.9,17z/data=!3d37.7749!4d-122.4194'
    expect(extractLatLngFromUrl(url)).toEqual({ lat: 37.7749, lng: -122.4194 })
  })

  it('falls back to the @lat,lng map centre', () => {
    expect(extractLatLngFromUrl('https://maps.google.com/maps/@40.7128,-74.006,12z')).toEqual({
      lat: 40.7128,
      lng: -74.006,
    })
  })

  it('reads q= / ll= / query= params', () => {
    expect(extractLatLngFromUrl('https://maps.google.com/?q=51.5074,-0.1278')).toEqual({ lat: 51.5074, lng: -0.1278 })
    expect(extractLatLngFromUrl('https://www.google.com/maps?ll=48.8566,2.3522&z=10')).toEqual({ lat: 48.8566, lng: 2.3522 })
    expect(extractLatLngFromUrl('https://www.google.com/maps/search/?api=1&query=35.6762,139.6503')).toEqual({ lat: 35.6762, lng: 139.6503 })
  })

  it('returns null for cid / place-id links with no coordinates', () => {
    expect(extractLatLngFromUrl('https://maps.google.com/?cid=1234567890')).toBeNull()
    expect(extractLatLngFromUrl('')).toBeNull()
    expect(extractLatLngFromUrl(null)).toBeNull()
  })

  it('rejects out-of-range and null-island coordinates', () => {
    expect(extractLatLngFromUrl('https://maps.google.com/?q=0,0')).toBeNull()
    expect(extractLatLngFromUrl('https://maps.google.com/?q=200,999')).toBeNull()
  })
})

describe('validCoords', () => {
  it('accepts in-range pairs and rejects the rest', () => {
    expect(validCoords(45, 90)).toEqual({ lat: 45, lng: 90 })
    expect(validCoords(91, 0)).toBeNull()
    expect(validCoords(0, 0)).toBeNull()
    expect(validCoords(NaN, 5)).toBeNull()
  })
})

describe('clampTitle / clampUrl', () => {
  it('trims, collapses whitespace, and enforces length', () => {
    expect(clampTitle('  Blue   Bottle  ')).toBe('Blue Bottle')
    expect(clampTitle('   ')).toBeNull()
    expect(clampTitle('x'.repeat(150))?.length).toBe(100)
  })

  it('keeps only http(s) links within the length cap', () => {
    expect(clampUrl('https://example.com')).toBe('https://example.com')
    expect(clampUrl('javascript:alert(1)')).toBeNull()
    expect(clampUrl('data:text/html,evil')).toBeNull()
    expect(clampUrl('https://e.com/' + 'a'.repeat(600))).toBeNull()
  })
})

describe('parseGeoJSON', () => {
  const geo = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] }, // [lng, lat]
        properties: {
          location: { name: 'Ferry Building', address: '1 Ferry Building, SF' },
          google_maps_url: 'https://maps.google.com/?cid=1',
        },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [2.3522, 48.8566] },
        properties: { Title: 'Eiffel Tower' },
      },
      // Missing title → dropped
      { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 1] }, properties: {} },
    ],
  })

  it('reads coordinates in [lng, lat] order and picks a title', () => {
    const places = parseGeoJSON(geo)
    expect(places).toHaveLength(2)
    expect(places[0]).toMatchObject({ title: 'Ferry Building', lat: 37.7749, lng: -122.4194, note: '1 Ferry Building, SF', needsGeocode: false })
    expect(places[1]).toMatchObject({ title: 'Eiffel Tower', lat: 48.8566, lng: 2.3522 })
  })

  it('returns [] on malformed JSON', () => {
    expect(parseGeoJSON('{not json')).toEqual([])
  })
})

describe('parseCsv', () => {
  it('parses Title/Note/URL columns and extracts coords from the URL', () => {
    const csv = [
      'Title,Note,URL,Comment',
      'Blue Bottle,Great coffee,"https://www.google.com/maps/place/x/data=!3d37.7749!4d-122.4194",',
      '"Joe' + "'" + 's, Pizza",,https://maps.google.com/?cid=99,tasty',
    ].join('\n')
    const places = parseCsv(csv)
    expect(places).toHaveLength(2)
    expect(places[0]).toMatchObject({ title: 'Blue Bottle', note: 'Great coffee', lat: 37.7749, lng: -122.4194, needsGeocode: false })
    // Second row: comma inside a quoted title; cid URL has no coords → needsGeocode
    expect(places[1].title).toBe("Joe's, Pizza")
    expect(places[1]).toMatchObject({ lat: null, lng: null, needsGeocode: true })
  })

  it('handles a header-less two-column export', () => {
    const places = parseCsv('Central Park,"https://maps.google.com/?q=40.7829,-73.9654"')
    expect(places).toHaveLength(1)
    expect(places[0]).toMatchObject({ title: 'Central Park', lat: 40.7829, lng: -73.9654 })
  })

  it('skips rows with no title', () => {
    expect(parseCsv('Title,URL\n,https://x.com')).toHaveLength(0)
  })
})

describe('splitCsvLine', () => {
  it('respects quotes and "" escapes', () => {
    expect(splitCsvLine('a,"b,c","d""e"')).toEqual(['a', 'b,c', 'd"e'])
  })
})

describe('dedupePlaces', () => {
  it('drops same-title same-location duplicates', () => {
    const dup = [
      { title: 'Cafe', note: null, url: null, lat: 1.23456, lng: 2.34567, needsGeocode: false },
      { title: 'cafe', note: 'x', url: null, lat: 1.23458, lng: 2.34569, needsGeocode: false }, // rounds equal
      { title: 'Cafe', note: null, url: null, lat: 9, lng: 9, needsGeocode: false },
    ]
    expect(dedupePlaces(dup)).toHaveLength(2)
  })
})

describe('parsePlacesFile', () => {
  it('dispatches by extension and reports skipped duplicates', () => {
    const csv = 'Title,URL\nA,https://maps.google.com/?q=1,1\nA,https://maps.google.com/?q=1,1'
    const res = parsePlacesFile('saved.csv', csv)
    expect(res.format).toBe('csv')
    expect(res.places).toHaveLength(1)
    expect(res.skipped).toBe(1)
  })

  it('detects geojson by content when extension is missing', () => {
    const res = parsePlacesFile('export', '{"features":[{"geometry":{"coordinates":[2.3522,48.8566]},"properties":{"name":"Paris"}}]}')
    expect(res.format).toBe('geojson')
    expect(res.places[0]).toMatchObject({ title: 'Paris', lat: 48.8566 })
  })
})

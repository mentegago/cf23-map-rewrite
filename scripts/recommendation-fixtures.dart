// Run from the rewrite root with the sibling Flutter checkout:
// dart --packages=../cf23-map/.dart_tool/package_config.json scripts/recommendation-fixtures.dart
import 'dart:convert';
import 'dart:io';
import '../../cf23-map/lib/models/creator.dart';
import '../../cf23-map/lib/models/fandom.dart';
import '../../cf23-map/lib/models/recommendation.dart';
import '../../cf23-map/lib/models/booth_proximity.dart';
import '../../cf23-map/lib/services/recommendation_engine.dart';

void main() {
  const now = 1800000000000;
  final registry = {
    'schemaVersion': '1.0',
    'fandoms': [
      for (final entry in [
        (1, 'Publisher', 'publisher_umbrella', null),
        (2, 'Franchise', 'franchise', 1),
        (3, 'Game A', 'property', 2),
        (4, 'Game B', 'property', 2),
        (5, 'Game C', 'property', 1),
        (6, 'Original', 'generic_tag', null),
        (7, 'Other', 'property', null),
        (8, 'Missing parent child', 'property', 99),
        (9, 'Missing parent sibling', 'property', 99)
      ])
        {
          'id': entry.$1,
          'name': entry.$2,
          'kind': entry.$3,
          'parentId': entry.$4,
          'alternateNames': <String>[]
        },
    ]
  };
  final document = {
    'schemaVersion': '1.0',
    'event': {
      'id': 'test',
      'name': 'Test',
      'days': [
        {'id': 'sat', 'label': 'Saturday'},
        {'id': 'sun', 'label': 'Sunday'}
      ]
    },
    'exhibitors': [
      for (var i = 0; i < 70; i++)
        {
          'id': i + 1,
          'name': 'Creator ${i.toString().padLeft(3, '0')}',
          'fandomIds': [3 + i % 7, if (i % 3 == 0) 6, if (i % 5 == 0) 2]
              .toSet()
              .toList(),
          'spaces': [
            if (i != 12)
              {'code': 'A-${(i ~/ 2 + 1).toString().padLeft(2, '0')}a'}
          ],
          'attendanceDates': [i % 3 == 0 ? 'sun' : 'sat'],
          'offerings': [],
          'links': [],
          'assets': {
            'gallery': [if (i % 4 == 0) 'sample.jpg']
          },
        }
    ]
  };
  final proximity = {
    'schema_version': 1,
    'booths': [for (var i = 1; i <= 34; i++) 'A-${i}a'],
    'neighbors': [
      for (var i = 0; i < 34; i++)
        [
          for (var j = 0; j < 34; j++)
            if (i != j && (i - j).abs() <= 5) [j, (i - j).abs() * 2]
        ]
    ]
  };
  final fandoms = {
    for (final f in registry['fandoms'] as List)
      (f as Map)['id'] as int: Fandom.fromJson(Map<String, dynamic>.from(f))
  };
  final creators = [
    for (final c in document['exhibitors'] as List)
      Creator.fromCatalogJson(Map<String, dynamic>.from(c),
          fandomById: fandoms, dayLabels: {})
  ];
  final engine = RecommendationEngine(
      boothProximity: BoothProximityData.fromJson(proximity));
  final profile = {
    'schema_version': 2,
    'explicit_fandom_signals': {
      '3': {'strength': 8, 'last_updated': now - 86400000},
      '8': {'strength': 3, 'last_updated': 0}
    },
    'creator_interactions': {
      for (var i = 1; i <= 30; i++)
        '$i': {
          'open_strength': i % 6 / 2,
          'deliberate_open_count': 1,
          'sample_work_views': i % 4,
          'external_link_clicks': i % 3,
          'shares': i % 2,
          'favorite': i == 1,
          'consideration': .2 + i / 40,
          'last_updated': i == 1 ? 0 : now - i * 3600000,
        }
    }
  };
  final cases = <Map<String, dynamic>>[];
  for (final seed in [42]) {
    for (final limit in [100]) {
      final previous = {4, 9, 12, 15, 25, 39, 52};
      final favorites = {1, 13, 69};
      final result = engine.recommend(
          creators: creators,
          profile: RecommendationProfile.fromJson(profile),
          favoriteIds: favorites,
          allFandoms: fandoms,
          sessionExposureIds: {},
          userSeed: seed,
          previousIds: previous,
          now: DateTime.fromMillisecondsSinceEpoch(now),
          limit: limit);
      cases.add({
        'seed': seed,
        'limit': limit,
        'now': now,
        'profile': profile,
        'favorites': favorites.toList(),
        'previousIds': previous.toList(),
        'homeFandoms': engine.rankedInterestedFandoms(
            creators: creators,
            profile: RecommendationProfile.fromJson(profile),
            favoriteIds: favorites,
            allFandoms: fandoms,
            now: DateTime.fromMillisecondsSinceEpoch(now)),
        'expected': [
          for (final r in result)
            {
              'id': r.creator.id,
              'score': r.score,
              'matching': r.matchingFandoms
            }
        ]
      });
    }
  }
  for (final signalId in [0, 1, 3, 6, 8]) {
    final p = {
      'schema_version': 2,
      'creator_interactions': {},
      'explicit_fandom_signals': {
        if (signalId != 0) '$signalId': {'strength': 5, 'last_updated': now},
      }
    };
    final result = engine.recommend(
        creators: creators,
        profile: RecommendationProfile.fromJson(p),
        favoriteIds: {},
        allFandoms: fandoms,
        sessionExposureIds: {},
        userSeed: 42,
        now: DateTime.fromMillisecondsSinceEpoch(now),
        limit: 100);
    cases.add({
      'seed': 42,
      'limit': 100,
      'signalId': signalId,
      'now': now,
      'profile': p,
      'favorites': [],
      'previousIds': [],
      'homeFandoms': engine.rankedInterestedFandoms(
          creators: creators,
          profile: RecommendationProfile.fromJson(p),
          favoriteIds: {},
          allFandoms: fandoms,
          now: DateTime.fromMillisecondsSinceEpoch(now)),
      'expected': [
        for (final r in result)
          {'id': r.creator.id, 'score': r.score, 'matching': r.matchingFandoms}
      ]
    });
  }
  final realCatalog =
      json.decode(File('public/data/catalog-initial.json').readAsStringSync());
  final realRegistry =
      json.decode(File('public/data/fandoms-initial.json').readAsStringSync());
  final realFandoms = {
    for (final f in realRegistry['fandoms'])
      f['id'] as int: Fandom.fromJson(Map<String, dynamic>.from(f))
  };
  final realCreators = [
    for (final c in realCatalog['exhibitors'])
      Creator.fromCatalogJson(Map<String, dynamic>.from(c),
          fandomById: realFandoms, dayLabels: {})
  ];
  final realEngine = RecommendationEngine(
      boothProximity: BoothProximityData.fromJson(json.decode(
          File('public/data/booth-proximity.json').readAsStringSync())));
  final realProfile = {
    'schema_version': 2,
    'creator_interactions': {},
    'explicit_fandom_signals': {
      '2': {'strength': 5, 'last_updated': now}
    }
  };
  final realFavorites = realCreators
      .where((c) => c.fandoms.isNotEmpty)
      .take(4)
      .map((c) => c.id)
      .toSet();
  final realResult = realEngine.recommend(
      creators: realCreators,
      profile: RecommendationProfile.fromJson(realProfile),
      favoriteIds: realFavorites,
      allFandoms: realFandoms,
      sessionExposureIds: {},
      userSeed: 42,
      now: DateTime.fromMillisecondsSinceEpoch(now));
  final real = {
    'profile': realProfile,
    'favorites': realFavorites.toList(),
    'now': now,
    'seed': 42,
    'expected': [
      for (final r in realResult)
        {'id': r.creator.id, 'score': r.score, 'matching': r.matchingFandoms}
    ]
  };
  File('test/fixtures/recommendations.json')
      .writeAsStringSync('${const JsonEncoder.withIndent('  ').convert({
        'catalog': document,
        'registry': registry,
        'proximity': proximity,
        'cases': cases,
        'real': real
      })}\n');
}

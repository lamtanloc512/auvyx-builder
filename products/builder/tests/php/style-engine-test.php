<?php
/**
 * Parity: the PHP engine must reproduce shared/fixtures/style-engine/cases.json exactly.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Plugin;
use Auvyx\Builder\StyleEngine\StyleEngine;

$auvyx_fixtures = json_decode( (string) file_get_contents( AUVYX_SHARED_DIR . '/fixtures/style-engine/cases.json' ), true );
$auvyx_engine   = new StyleEngine( Plugin::shared_data( 'css-properties' )['properties'] );
$auvyx_default  = Plugin::shared_data( 'design-system' )['breakpoints'];

foreach ( $auvyx_fixtures['cases'] as $auvyx_case ) {
	auvyx_test(
		'parity: ' . $auvyx_case['name'],
		static function () use ( $auvyx_case, $auvyx_engine, $auvyx_default ) {
			$result = $auvyx_engine->compile_block( $auvyx_case['styles'], $auvyx_case['breakpoints'] ?? $auvyx_default );
			if ( null === $auvyx_case['expected'] ) {
				auvyx_assert_same( null, $result );
				return;
			}
			$class = $auvyx_case['expected']['className'];
			auvyx_assert_same( $class, $result['className'] ?? null, 'className' );
			auvyx_assert_same( str_replace( '{{c}}', $class, $auvyx_case['expected']['css'] ), $result['css'], 'css' );
		}
	);
}

foreach ( $auvyx_fixtures['scoped'] as $auvyx_case ) {
	auvyx_test(
		'scoped parity: ' . $auvyx_case['name'],
		static function () use ( $auvyx_case, $auvyx_engine ) {
			$result = $auvyx_engine->compile_scoped_css( $auvyx_case['css'] );
			if ( null === $auvyx_case['expected'] ) {
				auvyx_assert_same( null, $result );
				return;
			}
			$class = $auvyx_case['expected']['className'];
			auvyx_assert_same( $class, $result['className'] ?? null, 'className' );
			auvyx_assert_same( str_replace( '{{c}}', $class, $auvyx_case['expected']['css'] ), $result['css'], 'css' );
		}
	);
}

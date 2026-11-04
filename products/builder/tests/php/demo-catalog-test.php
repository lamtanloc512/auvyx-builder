<?php
/**
 * Demo catalogs from a folder a theme adds (`auvyx_builder_demo_catalog_dirs`): read locally, never asked of Auvyx Cloud. The
 * WooCommerce import itself (products, photos copied from the folder) is demo-catalog-run.php (`bun run test:demo-catalog`).
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\DemoCatalog\DemoCatalog;

auvyx_test(
	'demo catalogs: a folder of auvyx_builder_demo_catalog_dirs is read first, without the network; Auvyx Builder ships none',
	static function () {
		$asked   = array();
		$offline = static function ( $answer, $args, $url ) use ( &$asked ) {
			$asked[] = $url;
			return new WP_Error( 'auvyx_test_offline', 'Offline.' );
		};
		add_filter( 'pre_http_request', $offline, 10, 3 );
		delete_transient( 'auvyx_demo_pack_shop' );
		delete_transient( 'auvyx_demo_pack_miss_shop' );
		auvyx_assert_same( array(), DemoCatalog::dirs() );
		auvyx_assert_same( array(), DemoCatalog::catalog( 'shop' ), 'no folder, no cloud pack: no catalog' );
		auvyx_assert_same( false, is_dir( AUVYX_BUILDER_DIR . 'demo-catalogs' ), 'the plugin ships no catalogs' );

		$fixtures = AUVYX_BUILDER_DIR . 'tests/fixtures/demo-catalog';
		$dirs     = static fn( $d ) => array_merge( $d, array( $fixtures . '/', WP_CONTENT_DIR . '/no-such-folder' ) );
		add_filter( 'auvyx_builder_demo_catalog_dirs', $dirs );
		$asked   = array();
		$catalog = DemoCatalog::catalog( 'shop' );
		auvyx_assert_same( array( $fixtures ), DemoCatalog::dirs(), 'existing folders only, without the trailing slash' );
		auvyx_assert_same( array( 'mug', 'up', 'remote', 'missing' ), array_column( $catalog['products'], 'key' ) );
		auvyx_assert_same( $fixtures, $catalog['_auvyx_dir'] );
		auvyx_assert_same( array(), $asked, 'a local catalog asks the network nothing' );
		auvyx_assert_same( array(), DemoCatalog::catalog( '../shop' ), 'no traversal in ids' );
		remove_filter( 'auvyx_builder_demo_catalog_dirs', $dirs );
		remove_filter( 'pre_http_request', $offline, 10 );
	}
);

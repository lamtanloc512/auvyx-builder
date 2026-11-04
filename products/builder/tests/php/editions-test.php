<?php
/**
 * Auvyx Builder alone (docs/editions.md, WordPress.org guidelines 5 and 7): no Pro template, no Pro setting, no licence or
 * updater, no upgrade page, and no call to any server when the admin loads.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Edition\Edition;
use Auvyx\Builder\Modules\Patterns\Patterns;
use Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder;

auvyx_test(
	'editions: without Pro, only Auvyx Builder\'s own templates, and none of shared/editions.json proTemplates',
	static function () {
		if ( Edition::pro() ) {
			return; // run by test:pro with Pro active: products/pro/tests/php/templates-test.php covers it
		}
		auvyx_assert_same( array( 'builder' ), wp_list_pluck( Patterns::libraries(), 'id' ) );
		auvyx_assert_same( array(), Patterns::manifest( true ), 'the editors get no added template' );
		$ids = wp_list_pluck( Patterns::manifest(), 'id' );
		auvyx_assert_same( array(), array_values( array_intersect( $ids, Edition::data()['proTemplates'] ) ), 'no Pro block' );
		foreach ( Patterns::manifest() as $template ) {
			auvyx_assert_same( true, in_array( $template['kit'], Edition::data()['freeKits'], true ), $template['id'] . ' is of a Pro kit (' . $template['kit'] . ')' );
		}
		auvyx_assert_same( false, WP_Block_Patterns_Registry::get_instance()->is_registered( 'auvyx-builder/popup' ) );
		$config = Edition::studio_config();
		auvyx_assert_same( false, $config['pro'] );
		auvyx_assert_same( '', $config['manageUrl'], 'no page to manage a licence' );
	}
);

auvyx_test(
	'editions: without Pro, no upgrade page, no Pro conditions, no licence, no updater',
	static function () {
		if ( Edition::pro() ) {
			return;
		}
		auvyx_assert_same( false, isset( ( (array) apply_filters( 'auvyx_builder_admin_tabs', array() ) )[ Edition::TAB ] ), 'no "Get Pro" tab' );
		$rules = ThemeBuilder::rule_labels();
		auvyx_assert_same( array( 'all', 'front', 'ids', 'singular' ), array_keys( $rules ), 'only the conditions Auvyx Builder answers' );
		auvyx_assert_same( false, class_exists( 'Auvyx\\Builder\\Modules\\License\\License' ) );
		auvyx_assert_same( false, has_filter( 'pre_set_site_transient_update_plugins' ) && false !== strpos( (string) wp_json_encode( array_keys( $GLOBALS['wp_filter']['pre_set_site_transient_update_plugins']->callbacks ?? array() ) ), 'auvyx' ), 'no updater' );
	}
);

auvyx_test(
	'editions: loading the admin calls no server and schedules nothing',
	static function () {
		$calls  = array();
		$record = static function ( $pre, $args, $url ) use ( &$calls ) {
			$calls[] = (string) $url;
			return new WP_Error( 'auvyx_test_offline', 'offline' );
		};
		add_filter( 'pre_http_request', $record, 1, 3 );
		wp_set_current_user( 1 );
		require_once ABSPATH . 'wp-admin/includes/class-wp-screen.php';
		require_once ABSPATH . 'wp-admin/includes/screen.php';
		set_current_screen( 'dashboard' );
		$menus = array( $GLOBALS['menu'] ?? null, $GLOBALS['submenu'] ?? null );
		do_action( 'admin_init' );
		do_action( 'admin_menu' );
		do_action( 'current_screen', get_current_screen() );
		do_action( 'admin_notices' );
		unset( $GLOBALS['current_screen'] ); // back to the front end for the next tests (is_admin())
		list( $GLOBALS['menu'], $GLOBALS['submenu'] ) = $menus; // phpcs:ignore WordPress.WP.GlobalVariablesOverride -- restores what the test changed
		remove_filter( 'pre_http_request', $record, 1 );
		$ours = array_filter( $calls, static fn( $u ) => false === strpos( $u, 'wordpress.org' ) && false === strpos( $u, 'w.org' ) );
		auvyx_assert_same( array(), array_values( $ours ), 'requests on admin load' );
		$crons = (string) wp_json_encode( _get_cron_array() );
		auvyx_assert_not_contains( 'auvyx_license', $crons, 'no licence check' );
	}
);

<?php
/**
 * Components' display rules (Modules/Components): exclusions, archives, terms, audience, roles and dates.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Components\Components;

auvyx_test(
	'components: display rules are cleaned: bad terms, dates and audiences are dropped',
	static function () {
		$c    = new Components();
		$rows = $c->sanitize_locations(
			array(
				array(
					'location' => 'body_open',
					'rule'     => 'terms',
					'terms'    => array( 'category:3', 'bad term', 'x:y' ),
					'exclude'  => '4, 0, -2, 9',
					'audience' => 'robots',
					'roles'    => array( 'Editor!', 'shop_manager' ),
					'from'     => '2026-02-30',
					'until'    => '2026-12-31',
				),
				array( 'location' => 'nowhere' ),
			)
		);
		auvyx_assert_same( 1, count( $rows ) );
		auvyx_assert_same( array( 'category:3' ), $rows[0]['terms'] );
		auvyx_assert_same( array( 4, 9 ), $rows[0]['exclude'] );
		auvyx_assert_same( 'all', $rows[0]['audience'] );
		auvyx_assert_same( array( 'editor', 'shop_manager' ), $rows[0]['roles'] );
		auvyx_assert_same( '', $rows[0]['from'], 'not a real day' );
		auvyx_assert_same( '2026-12-31', $rows[0]['until'] );
	}
);

auvyx_test(
	'components: without Auvyx Builder Pro a location with Pro rules shows nowhere; basic rules still work',
	static function () {
		$c    = new Components();
		$page = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Any' ) );
		$GLOBALS['wp_query']     = new WP_Query( array( 'page_id' => $page ) ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride
		$GLOBALS['wp_the_query'] = $GLOBALS['wp_query']; // phpcs:ignore WordPress.WP.GlobalVariablesOverride
		$base = array( 'location' => 'body_open', 'rule' => 'all', 'postTypes' => array(), 'ids' => array(), 'terms' => array(), 'exclude' => array(), 'audience' => 'all', 'roles' => array(), 'from' => '', 'until' => '' );
		$none = static fn() => false;
		add_filter( 'auvyx_builder_location_matches', $none, 999 );
		auvyx_assert_same( true, $c->matches( $base ) );
		auvyx_assert_same( true, $c->matches( array( 'rule' => 'ids', 'ids' => array( $page ) ) + $base ) );
		auvyx_assert_same( false, $c->matches( array( 'audience' => 'out' ) + $base ), 'an audience is a Pro rule' );
		auvyx_assert_same( false, $c->matches( array( 'rule' => 'search' ) + $base ) );
		auvyx_assert_same( true, Components::advanced( array( 'until' => '2030-01-01' ) + $base ) );
		auvyx_assert_same( false, Components::advanced( $base ) );
		remove_filter( 'auvyx_builder_location_matches', $none, 999 );
		wp_reset_query();
		wp_delete_post( $page, true );
	}
);

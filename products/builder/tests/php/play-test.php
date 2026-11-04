<?php
/**
 * Auvyx Play: the game document and its policy match the Studio's (shared/fixtures/play/cases.json).
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Play\Play;
use Auvyx\Builder\Modules\Play\PlayDocument;

$auvyx_play_fixtures = json_decode( (string) file_get_contents( AUVYX_SHARED_DIR . '/fixtures/play/cases.json' ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions

foreach ( $auvyx_play_fixtures['documents'] as $auvyx_case ) {
	auvyx_test(
		'play parity: ' . $auvyx_case['name'],
		static function () use ( $auvyx_case ) {
			auvyx_assert_same( $auvyx_case['expected'], PlayDocument::render( $auvyx_case['game'], $auvyx_case['runtime'] ) );
		}
	);
}

foreach ( $auvyx_play_fixtures['policies'] as $auvyx_case ) {
	auvyx_test(
		'play policy parity: ' . $auvyx_case['siteOrigin'],
		static function () use ( $auvyx_case ) {
			auvyx_assert_same( $auvyx_case['expected'], PlayDocument::csp( $auvyx_case['siteOrigin'], $auvyx_case['runtimeOrigin'] ) );
		}
	);
}

foreach ( $auvyx_play_fixtures['embeds'] as $auvyx_case ) {
	auvyx_test(
		'play embed parity: ' . $auvyx_case['name'],
		static function () use ( $auvyx_case ) {
			auvyx_assert_same( $auvyx_case['expected'], PlayDocument::embed( $auvyx_case['game'], $auvyx_case['label'] ) );
		}
	);
}

auvyx_test(
	'a game over a limit is refused before it is kept',
	static function () {
		auvyx_assert_same( null, PlayDocument::over_limit( array( 'js' => 'x' ) ) );
		auvyx_assert_contains( 'js', (string) PlayDocument::over_limit( array( 'js' => str_repeat( 'x', 400001 ) ) ) );
	}
);

/** A REST call as the current user. */
function auvyx_play_rest( string $method, string $route, array $body = array() ): WP_REST_Response {
	$request = new WP_REST_Request( $method, $route );
	if ( $body ) {
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( (string) wp_json_encode( $body ) );
	}
	return rest_ensure_response( rest_do_request( $request ) );
}

function auvyx_play_game(): array {
	return array(
		'title'  => 'Coin Run',
		'lang'   => 'vi',
		'html'   => '<canvas></canvas>',
		'css'    => 'canvas{width:100%}',
		'js'     => 'export default ({ el }) => { el.dataset.ok = "1" }',
		'libs'   => array( 'three', 'gsap' ),
		'assets' => array( array( 'name' => 'hero.png', 'type' => 'image/png', 'url' => 'https://example.com/hero.png' ) ),
	);
}

auvyx_test(
	'play: an author keeps a game under the Studio key; its source comes back unfiltered, libraries the sandbox lacks dropped',
	static function () {
		$author = wp_insert_user( array( 'user_login' => 'play_author_' . wp_rand(), 'user_pass' => wp_generate_password(), 'role' => 'author' ) );
		wp_set_current_user( $author );
		$game         = auvyx_play_game();
		$game['html'] = '<canvas onclick="x()"></canvas><script>1</script>';
		$key          = 'gtest' . wp_rand( 100000, 999999 );
		$created      = auvyx_play_rest( 'PUT', "/auvyx/v1/games/$key", $game );
		auvyx_assert_same( 201, $created->get_status() );
		$got = auvyx_play_rest( 'GET', "/auvyx/v1/games/$key" )->get_data();
		auvyx_assert_same( $game['html'], $got['html'], 'kept as written (it runs sandboxed)' );
		auvyx_assert_same( array( 'three' ), $got['libs'] );
		auvyx_assert_same( 'publish', $got['status'] );
		auvyx_assert_contains( 'auvyx_play=' . $key, $got['url'] );
		auvyx_assert_same( 200, auvyx_play_rest( 'PUT', "/auvyx/v1/games/$key", array_merge( $game, array( 'title' => 'Again' ) ) )->get_status(), 'the same key replaces it' );
		auvyx_assert_same( 1, count( get_posts( array( 'post_type' => Play::TYPE, 'meta_key' => Play::KEY, 'meta_value' => $key, 'fields' => 'ids' ) ) ), 'one game per key' );
		wp_set_current_user( 0 );
		auvyx_assert_same( 401, auvyx_play_rest( 'GET', "/auvyx/v1/games/$key" )->get_status(), 'visitors do not read the source' );
		$other = wp_insert_user( array( 'user_login' => 'play_other_' . wp_rand(), 'user_pass' => wp_generate_password(), 'role' => 'author' ) );
		wp_set_current_user( $other );
		auvyx_assert_same( 403, auvyx_play_rest( 'PUT', "/auvyx/v1/games/$key", $game )->get_status(), 'another author cannot change it' );
		wp_set_current_user( 1 );
		auvyx_assert_same( 200, auvyx_play_rest( 'PUT', "/auvyx/v1/games/$key", array_merge( $game, array( 'title' => 'Coin Run 2' ) ) )->get_status(), 'an editor can' );
		auvyx_assert_same( 'Coin Run 2', Play::source( Play::find( $key ) )['title'] );
	}
);

auvyx_test(
	'play: bad sources and keys are refused with what is wrong',
	static function () {
		wp_set_current_user( 1 );
		auvyx_assert_same( 400, auvyx_play_rest( 'PUT', '/auvyx/v1/games/gbadtitle1', array( 'title' => '' ) )->get_status(), 'no title' );
		$bad_asset = array_merge( auvyx_play_game(), array( 'assets' => array( array( 'name' => '../x', 'type' => 'image/png', 'url' => 'javascript:alert(1)' ) ) ) );
		auvyx_assert_same( 400, auvyx_play_rest( 'PUT', '/auvyx/v1/games/gbadasset1', $bad_asset )->get_status(), 'bad asset' );
		$big = array_merge( auvyx_play_game(), array( 'js' => str_repeat( 'x', 400001 ) ) );
		auvyx_assert_same( 413, auvyx_play_rest( 'PUT', '/auvyx/v1/games/gtoobig01', $big )->get_status(), 'too big' );
		auvyx_assert_same( 400, auvyx_play_rest( 'PUT', '/auvyx/v1/games/g1', auvyx_play_game() )->get_status(), 'a key too short' );
		$subscriber = wp_insert_user( array( 'user_login' => 'play_sub_' . wp_rand(), 'user_pass' => wp_generate_password(), 'role' => 'subscriber' ) );
		wp_set_current_user( $subscriber );
		auvyx_assert_same( 403, auvyx_play_rest( 'PUT', '/auvyx/v1/games/gsubscriber', auvyx_play_game() )->get_status(), 'subscribers make no games' );
	}
);

auvyx_test(
	'play: the site serves a game sandboxed; a draft only to who may edit it',
	static function () {
		wp_set_current_user( 1 );
		Play::save( 'gserved01', Play::parse( auvyx_play_game() ), 'publish' );
		$answer = Play::response( 'gserved01' );
		auvyx_assert_same( 200, $answer['status'] );
		$csp = $answer['headers']['Content-Security-Policy'];
		auvyx_assert_same( 0, strpos( $csp, 'sandbox allow-scripts' ), 'opaque origin' );
		auvyx_assert_contains( 'connect-src data: blob:', $csp );
		auvyx_assert_contains( 'frame-ancestors ' . preg_replace( '#^(https?://[^/]+).*$#', '$1', home_url() ), $csp );
		auvyx_assert_not_contains( '{', $csp );
		auvyx_assert_same( 'no-referrer', $answer['headers']['Referrer-Policy'] );
		auvyx_assert_contains( 'assets/play-game.js', $answer['body'] );
		auvyx_assert_contains( '{"libs":["three"]}', $answer['body'] );
		Play::save( 'gdraft001', Play::parse( auvyx_play_game() ), 'draft' );
		auvyx_assert_same( 200, Play::response( 'gdraft001' )['status'], 'its editor previews it' );
		wp_set_current_user( 0 );
		auvyx_assert_same( 404, Play::response( 'gdraft001' )['status'], 'visitors do not see a draft' );
		auvyx_assert_same( 200, Play::response( 'gserved01' )['status'], 'they see a published game' );
		auvyx_assert_same( 404, Play::response( 'gmissing1' )['status'], 'only games' );
		auvyx_assert_same( 404, Play::response( '../etc' )['status'], 'only keys' );
	}
);

auvyx_test(
	'play: a game element shows its game behind a play button, and loads play-page.js; a missing game shows nothing',
	static function () {
		wp_set_current_user( 1 );
		Play::save( 'gelement1', Play::parse( array_merge( auvyx_play_game(), array( 'poster' => 'https://example.com/coin.jpg' ) ) ), 'publish' );
		$html = do_blocks( '<!-- wp:auvyx/section {"auvyx":{"v":1,"game":"gelement1"}} --><section class="wp-block-auvyx-section"></section><!-- /wp:auvyx/section -->' );
		auvyx_assert_contains( 'class="auvyx-play" data-auvyx-play=', $html );
		auvyx_assert_contains( 'auvyx_play=gelement1', $html );
		auvyx_assert_contains( 'class="auvyx-play__poster" src="https://example.com/coin.jpg"', $html );
		auvyx_assert_same( true, wp_script_is( Play::HANDLE, 'enqueued' ), 'play-page.js' );
		$none = do_blocks( '<!-- wp:auvyx/section {"auvyx":{"v":1,"game":"gnothere1"}} --><section class="wp-block-auvyx-section"></section><!-- /wp:auvyx/section -->' );
		auvyx_assert_not_contains( 'auvyx-play', $none );
	}
);

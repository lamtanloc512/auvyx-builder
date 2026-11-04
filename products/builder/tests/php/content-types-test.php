<?php
/**
 * Content types: parity with the Studio (shared/fixtures/content-types/cases.json), registration, REST entries,
 * bindings, permissions, the fields box and an entry's page.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\ContentTypes\Admin as AuvyxContentAdmin;
use Auvyx\Builder\Modules\ContentTypes\ContentTypes;
use Auvyx\Builder\Modules\ContentTypes\Model;
use Auvyx\Builder\Modules\Data\Data;
use Auvyx\Builder\Plugin;

$auvyx_ct_fixtures = json_decode( (string) file_get_contents( AUVYX_SHARED_DIR . '/fixtures/content-types/cases.json' ), false );

/**
 * JSON compared structurally: objects as sorted arrays, every number as a float.
 *
 * @param mixed $value Value.
 * @return mixed
 */
function auvyx_ct_norm( $value ) {
	if ( $value instanceof stdClass ) {
		$value = get_object_vars( $value );
		ksort( $value );
		return array( '{}' => array_map( 'auvyx_ct_norm', $value ) );
	}
	if ( is_array( $value ) ) {
		if ( array() !== $value && ! Model::is_list( $value ) ) {
			ksort( $value );
			return array( '{}' => array_map( 'auvyx_ct_norm', $value ) );
		}
		return array_map( 'auvyx_ct_norm', $value );
	}
	return is_int( $value ) || is_float( $value ) ? (float) $value : $value;
}

/** A fixture field, checked as the Scala suite does (a link needs the type it links to). */
function auvyx_ct_field( stdClass $field ): array {
	$types = array(
		(object) array(
			'key'    => 'fixture',
			'fields' => array( $field ),
		),
	);
	if ( isset( $field->to ) ) {
		$types[] = (object) array( 'key' => $field->to );
	}
	$result = Model::validate( (object) array( 'types' => $types ) );
	if ( null === $result['definition'] ) {
		throw new RuntimeException( 'fixture field refused: ' . implode( '; ', $result['errors'] ) );
	}
	return $result['definition']['types'][0]['fields'][0];
}

foreach ( $auvyx_ct_fixtures->validate as $auvyx_case ) {
	auvyx_test(
		'content types validate parity: ' . $auvyx_case->name,
		static function () use ( $auvyx_case ) {
			$got = Model::validate( $auvyx_case->input );
			if ( isset( $auvyx_case->expected ) ) {
				auvyx_assert_same( array(), $got['errors'] );
				auvyx_assert_same( auvyx_ct_norm( $auvyx_case->expected ), auvyx_ct_norm( Model::to_json( $got['definition'] ) ) );
			} else {
				auvyx_assert_same( $auvyx_case->errors, $got['errors'] );
			}
		}
	);
}

foreach ( $auvyx_ct_fixtures->values as $auvyx_case ) {
	auvyx_test(
		'content types value parity: ' . $auvyx_case->name,
		static function () use ( $auvyx_case ) {
			// Values arrive as the REST API decodes them: objects are associative arrays.
			$raw = json_decode( (string) wp_json_encode( $auvyx_case->value ), true );
			$got = Model::sanitize( auvyx_ct_field( $auvyx_case->field ), $raw );
			if ( property_exists( $auvyx_case, 'kept' ) ) {
				auvyx_assert_same( '', $got['error'] );
				auvyx_assert_same( auvyx_ct_norm( $auvyx_case->kept ), auvyx_ct_norm( $got['value'] ) );
			} elseif ( property_exists( $auvyx_case, 'empty' ) ) {
				auvyx_assert_same( array( true, null ), array( $got['ok'], $got['value'] ) );
			} else {
				auvyx_assert_same( array( false, $auvyx_case->error ), array( $got['ok'], $got['error'] ) );
			}
		}
	);
}

foreach ( $auvyx_ct_fixtures->display as $auvyx_case ) {
	auvyx_test(
		'content types display parity: ' . $auvyx_case->name,
		static function () use ( $auvyx_case ) {
			$value = json_decode( (string) wp_json_encode( $auvyx_case->value ), true );
			auvyx_assert_same( $auvyx_case->text, Model::display( auvyx_ct_field( $auvyx_case->field ), $value ) );
		}
	);
}

auvyx_test(
	'content types: merge replaces by key and keeps the rest; a definition survives its own JSON',
	static function () {
		$base   = Model::validate( json_decode( '{"types":[{"key":"room"},{"key":"hall"}]}', false ) )['definition'];
		$patch  = Model::validate( json_decode( '{"types":[{"key":"room","label":"Rooms","fields":[{"key":"beds","type":"number"}]},{"key":"spa"}]}', false ) )['definition'];
		$merged = Model::merge( $base, $patch );
		auvyx_assert_same( array( 'room', 'hall', 'spa' ), array_column( $merged['types'], 'key' ) );
		auvyx_assert_same( array( 'beds' ), array_column( $merged['types'][0]['fields'], 'key' ) );
		$fixtures = json_decode( (string) file_get_contents( AUVYX_SHARED_DIR . '/fixtures/content-types/cases.json' ), false );
		$d        = Model::validate( $fixtures->validate[0]->input )['definition'];
		auvyx_assert_same( $d, Model::validate( Model::to_json( $d ) )['definition'], 'stored JSON (associative arrays) reads back the same' );
		auvyx_assert_same( 'property/price', Model::binding_key( $d['types'][0], $d['types'][0]['fields'][0] ) );
		auvyx_assert_same( '0.1', Model::show( 0.1 ) );
		auvyx_assert_same( '-0.50', Model::money( -0.5 ) );
		auvyx_assert_same( '12.5', Model::sanitize( array( 'key' => 'a', 'label' => 'A', 'kind' => 'text', 'required' => false ), 12.5 )['value'] );
	}
);

/** The definition the integration tests use. */
function auvyx_ct_setup(): void {
	$result = ContentTypes::save(
		json_decode(
			'{"types":[
				{"key":"property","label":"Properties","singular":"Property","icon":"home","fields":[
					{"key":"price","label":"Price","type":"money","min":0},
					{"key":"area","label":"Area","type":"number","required":true},
					{"key":"kind","label":"Kind","type":"select","options":["House","Flat"]},
					{"key":"pets","label":"Pets","type":"checkbox"},
					{"key":"site","label":"Site","type":"url"},
					{"key":"agent","label":"Agent","type":"relation","to":"agent"},
					{"key":"rooms","label":"Rooms","type":"repeater","fields":[{"key":"name","label":"Name","required":true},{"key":"size","label":"Size","type":"number"}]}
				]},
				{"key":"agent","label":"Agents","singular":"Agent","supports":["title","thumbnail"]}
			],
			"taxonomies":[{"key":"district","label":"Districts","singular":"District","types":["property"]}]}',
			false
		)
	);
	auvyx_assert_same( array(), $result['errors'] );
	Plugin::instance()->module( 'content-types' )->register_types();
}

function auvyx_ct_teardown(): void {
	ContentTypes::save( array( 'types' => array() ) );
	foreach ( array( 'property', 'agent' ) as $type ) {
		if ( post_type_exists( $type ) ) {
			unregister_post_type( $type );
		}
	}
	if ( taxonomy_exists( 'district' ) ) {
		unregister_taxonomy( 'district' );
	}
	wp_set_current_user( 1 );
}

/**
 * @param array<string, mixed> $body Body.
 */
function auvyx_ct_request( string $method, string $route, array $body = array() ): WP_REST_Response {
	$request = new WP_REST_Request( $method, $route );
	if ( array() !== $body ) {
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( (string) wp_json_encode( $body ) );
	}
	return rest_do_request( $request );
}

auvyx_test(
	'content types: a saved definition registers post types, taxonomies and typed meta',
	static function () {
		wp_set_current_user( 1 );
		auvyx_ct_setup();
		auvyx_assert_same( true, post_type_exists( 'property' ) );
		auvyx_assert_same( true, post_type_exists( 'agent' ) );
		auvyx_assert_same( true, taxonomy_exists( 'district' ) );
		auvyx_assert_same( true, is_object_in_taxonomy( 'property', 'district' ) );
		auvyx_assert_same( 'dashicons-admin-home', get_post_type_object( 'property' )->menu_icon );
		$meta = get_registered_meta_keys( 'post', 'property' );
		auvyx_assert_same( 'number', $meta['price']['type'] ?? '' );
		auvyx_assert_same( 'boolean', $meta['pets']['type'] ?? '' );
		auvyx_assert_same( 'array', $meta['rooms']['type'] ?? '' );
		auvyx_assert_same( 'auvyx-content/1', get_option( ContentTypes::OPTION )['schema'] );
		// A refused value is not stored through update_post_meta either.
		$id = wp_insert_post(
			array(
				'post_type'   => 'property',
				'post_title'  => 'Meta',
				'post_status' => 'publish',
			)
		);
		update_post_meta( $id, 'area', 80 );
		auvyx_assert_same( false, update_post_meta( $id, 'area', 'eighty' ) );
		auvyx_assert_same( 80.0, ContentTypes::value( $id, ContentTypes::field( 'property', 'area' ) ) );
		update_post_meta( $id, 'pets', false );
		auvyx_assert_same( false, ContentTypes::value( $id, ContentTypes::field( 'property', 'pets' ) ), 'No is kept as No' );
		wp_delete_post( $id, true );
		auvyx_ct_teardown();
	}
);

auvyx_test(
	'content types REST: an entry with valid values is stored typed; invalid values refuse it whole',
	static function () {
		wp_set_current_user( 1 );
		auvyx_ct_setup();
		$agent    = wp_insert_post(
			array(
				'post_type'   => 'agent',
				'post_title'  => 'Ann <b>Smith</b>',
				'post_status' => 'publish',
			)
		);
		$response = auvyx_ct_request(
			'POST',
			'/auvyx/v1/content-types/property/entries',
			array(
				'title'  => 'Villa',
				'status' => 'publish',
				'values' => array(
					'price' => '1234567.5',
					'area'  => 120,
					'kind'  => 'House',
					'pets'  => 'on',
					'agent' => (string) $agent,
					'rooms' => array(
						array(
							'name' => ' Hall ',
							'size' => '12',
							'hack' => '<b>',
						),
					),
				),
				'terms'  => array( 'district' => array( 'North' ) ),
			)
		);
		auvyx_assert_same( 201, $response->get_status(), (string) wp_json_encode( $response->get_data() ) );
		$entry = $response->get_data();
		$id    = (int) $entry['id'];
		auvyx_assert_same( 1234567.5, get_post_meta( $id, 'price', true ) + 0.0 );
		auvyx_assert_same( '1', get_post_meta( $id, 'pets', true ) );
		auvyx_assert_same( array( array( 'name' => 'Hall', 'size' => 12.0 ) ), get_post_meta( $id, 'rooms', true ) ); // phpcs:ignore
		auvyx_assert_same( array( 'North' ), $entry['terms']->district );
		auvyx_assert_same( true, $entry['values']->pets );
		auvyx_assert_same( $agent, $entry['values']->agent );

		// Bindings read through Auvyx data.
		auvyx_assert_same( '1,234,567.50', Data::value( 'property/price', $id ) );
		auvyx_assert_same( 'Yes', Data::value( 'property/pets', $id ) );
		auvyx_assert_same( 'Ann Smith', Data::value( 'property/agent', $id ) );
		auvyx_assert_same( '1 row', Data::value( 'property/rooms', $id ) );
		auvyx_assert_same( true, Data::valid( 'property/area' ) );
		auvyx_assert_same( true, isset( Data::sources()['content/property'] ) );
		$args = Data::query_args( array( 'source' => 'content/property', 'postType' => 'property' ) );
		auvyx_assert_same( 'property', $args['post_type'] );

		// Invalid: every error, nothing saved.
		$before   = wp_count_posts( 'property' )->publish;
		$response = auvyx_ct_request(
			'POST',
			'/auvyx/v1/content-types/property/entries',
			array(
				'title'  => 'Bad',
				'values' => array(
					'price' => -5,
					'kind'  => 'Castle',
					'rooms' => array( array( 'size' => 3 ) ),
				),
			)
		);
		auvyx_assert_same( 400, $response->get_status() );
		$data = $response->get_data();
		auvyx_assert_same( 'invalid', $data['code'] );
		auvyx_assert_same( array( 'Price: at least 0', 'Area is required', 'Kind: not a valid choice', 'Rooms, row 1: Name is required' ), $data['data']['errors'] );
		wp_cache_flush();
		auvyx_assert_same( $before, wp_count_posts( 'property' )->publish );

		// Update, read, list, trash.
		$response = auvyx_ct_request(
			'POST',
			'/auvyx/v1/content-types/property/entries/' . $id,
			array(
				'id'     => '999999',
				'title'  => 'Villa 2',
				'values' => array( 'area' => '90.5' ),
			)
		);
		auvyx_assert_same( 200, $response->get_status(), (string) wp_json_encode( $response->get_data() ) );
		auvyx_assert_same( false, metadata_exists( 'post', $id, 'price' ), 'a full update empties what it does not send' );
		auvyx_assert_same( 'Villa 2', get_post( $id )->post_title );
		$list = auvyx_ct_request( 'GET', '/auvyx/v1/content-types/property/entries' )->get_data();
		auvyx_assert_same( 1, $list['total'] );
		auvyx_assert_same( 90.5, $list['items'][0]['values']->area );
		auvyx_assert_same( 404, auvyx_ct_request( 'GET', '/auvyx/v1/content-types/agent/entries/' . $id )->get_status(), 'an entry of another type' );
		$request = new WP_REST_Request( 'POST', '/auvyx/v1/content-types/property/entries/' . $id );
		$request->set_query_params( array( '_method' => 'DELETE' ) );
		$request->set_method( 'DELETE' );
		auvyx_assert_same( 200, rest_do_request( $request )->get_status() );
		auvyx_assert_same( 'trash', get_post_status( $id ) );
		wp_delete_post( $id, true );
		wp_delete_post( $agent, true );
		auvyx_ct_teardown();
	}
);

auvyx_test(
	'content types REST: a subscriber saves neither the definition nor entries; an editor cannot save the definition',
	static function () {
		wp_set_current_user( 1 );
		auvyx_ct_setup();
		$subscriber = wp_insert_user( array( 'user_login' => 'ct-subscriber', 'user_pass' => wp_generate_password(), 'role' => 'subscriber' ) ); // phpcs:ignore
		$editor     = wp_insert_user( array( 'user_login' => 'ct-editor', 'user_pass' => wp_generate_password(), 'role' => 'editor' ) ); // phpcs:ignore
		wp_set_current_user( $subscriber );
		auvyx_assert_same( 403, auvyx_ct_request( 'POST', '/auvyx/v1/content-types', array( 'definition' => array( 'types' => array() ) ) )->get_status() );
		auvyx_assert_same( 403, auvyx_ct_request( 'GET', '/auvyx/v1/content-types' )->get_status() );
		auvyx_assert_same( 403, auvyx_ct_request( 'POST', '/auvyx/v1/content-types/property/entries', array( 'title' => 'x', 'values' => array( 'area' => 1 ) ) )->get_status() ); // phpcs:ignore
		wp_set_current_user( $editor );
		auvyx_assert_same( 403, auvyx_ct_request( 'POST', '/auvyx/v1/content-types', array( 'definition' => array( 'types' => array() ) ) )->get_status() );
		auvyx_assert_same( 200, auvyx_ct_request( 'GET', '/auvyx/v1/content-types' )->get_status() );
		wp_set_current_user( 1 );
		$bad = auvyx_ct_request( 'POST', '/auvyx/v1/content-types', array( 'definition' => array( 'types' => array( array( 'key' => 'product' ) ) ) ) );
		auvyx_assert_same( 400, $bad->get_status() );
		auvyx_assert_same( array( 'types[0].key: reserved' ), $bad->get_data()['data']['errors'] );
		$good = auvyx_ct_request( 'POST', '/auvyx/v1/content-types', array( 'definition' => array( 'types' => array( array( 'key' => 'agent' ) ) ) ) );
		auvyx_assert_same( 200, $good->get_status() );
		auvyx_assert_same( 'agent', $good->get_data()['definition']['types'][0]['slug'] );
		require_once ABSPATH . 'wp-admin/includes/user.php';
		wp_delete_user( $subscriber );
		wp_delete_user( $editor );
		auvyx_ct_teardown();
	}
);

auvyx_test(
	'content types: the fields box keeps valid fields and reports refused ones without losing the others',
	static function () {
		wp_set_current_user( 1 );
		auvyx_ct_setup();
		$id = wp_insert_post(
			array(
				'post_type'   => 'property',
				'post_title'  => 'Box',
				'post_status' => 'draft',
			)
		);
		update_post_meta( $id, 'area', 50 );
		$_POST[ AuvyxContentAdmin::NONCE ] = wp_create_nonce( AuvyxContentAdmin::NONCE_SAVE );
		$_POST['auvyx_fields']              = wp_slash(
			array(
				'price' => '19.999',
				'area'  => 'big',
				'kind'  => 'Flat',
				'pets'  => '0',
				'site'  => 'javascript:alert(1)',
				'agent' => '',
				'rooms' => array(
					'0'   => array(
						'name' => 'Kitchen',
						'size' => '',
					),
					'n1'  => array(
						'name' => '',
						'size' => '',
					),
				),
			)
		);
		( new AuvyxContentAdmin() )->save_post( $id, get_post( $id ) );
		unset( $_POST[ AuvyxContentAdmin::NONCE ], $_POST['auvyx_fields'] );
		auvyx_assert_same( 20.0, ContentTypes::value( $id, ContentTypes::field( 'property', 'price' ) ) );
		auvyx_assert_same( 50.0, ContentTypes::value( $id, ContentTypes::field( 'property', 'area' ) ), 'refused: the previous value stays' );
		auvyx_assert_same( 'Flat', ContentTypes::value( $id, ContentTypes::field( 'property', 'kind' ) ) );
		auvyx_assert_same( false, ContentTypes::value( $id, ContentTypes::field( 'property', 'pets' ) ) );
		auvyx_assert_same( array( array( 'name' => 'Kitchen' ) ), ContentTypes::value( $id, ContentTypes::field( 'property', 'rooms' ) ) );
		$kept = get_transient( 'auvyx_ct_errors_1_' . $id );
		auvyx_assert_same( array( 'Area: not a valid number', 'Site: not a valid link' ), $kept['errors'] );
		ob_start();
		( new AuvyxContentAdmin() )->render_box( get_post( $id ) );
		$html = (string) ob_get_clean();
		auvyx_assert_contains( 'Area: not a valid number', $html );
		auvyx_assert_contains( 'for="auvyx-field-price"', $html );
		auvyx_assert_contains( '<template>', $html );
		auvyx_assert_not_contains( 'javascript:alert', str_replace( 'value="javascript:alert(1)"', '', $html ), 'typed values only inside escaped attributes' );
		wp_delete_post( $id, true );
		auvyx_ct_teardown();
	}
);

auvyx_test(
	'content types: an entry page lists its fields after the content, unless the content binds them; the archive resolves',
	static function () {
		global $wp_query, $wp_the_query, $wp_rewrite;
		wp_set_current_user( 0 );
		auvyx_ct_setup();
		wp_set_current_user( 0 );
		$agent = wp_insert_post(
			array(
				'post_type'   => 'agent',
				'post_title'  => 'Ann',
				'post_status' => 'publish',
			)
		);
		$id    = wp_insert_post(
			array(
				'post_type'    => 'property',
				'post_title'   => 'Cottage',
				'post_content' => '<p>Nice.</p>',
				'post_status'  => 'publish',
			)
		);
		ContentTypes::store(
			$id,
			ContentTypes::type( 'property' ),
			array(
				'price' => 250000.0,
				'kind'  => 'House',
				'pets'  => true,
				'site'  => 'https://example.com/a?b=<x>',
				'agent' => $agent,
				'rooms' => array( array( 'name' => '<script>x</script>', 'size' => 9.0 ) ), // phpcs:ignore
			)
		);
		$saved_query = $wp_query;
		$wp_query    = new WP_Query( // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- a singular view for the test.
			array(
				'p'         => $id,
				'post_type' => 'property',
			)
		);
		$wp_the_query = $wp_query; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		$wp_query->the_post();
		$html = (string) apply_filters( 'the_content', get_post()->post_content );
		auvyx_assert_contains( '<dl class="auvyx-fields">', $html );
		auvyx_assert_contains( '<dt>Price</dt><dd>250,000.00</dd>', $html );
		auvyx_assert_contains( '<dt>Pets</dt><dd>Yes</dd>', $html );
		auvyx_assert_contains( 'href="' . get_permalink( $agent ) . '">Ann</a>', $html );
		auvyx_assert_contains( '<table class="auvyx-fields__rows">', $html );
		auvyx_assert_contains( '&lt;script&gt;', $html );
		auvyx_assert_not_contains( '<script>x', $html );
		auvyx_assert_not_contains( '<dt>Area</dt>', $html, 'empty fields are left out' );

		add_filter( 'auvyx_content_types_show_fields', '__return_false' );
		auvyx_assert_not_contains( 'auvyx-fields', (string) apply_filters( 'the_content', '<p>Nice.</p>' ) );
		remove_filter( 'auvyx_content_types_show_fields', '__return_false' );
		$bound = '<!-- wp:auvyx/text {"metadata":{"bindings":{"content":{"source":"auvyx/data","args":{"key":"property/price"}}}}} --><p class="wp-block-auvyx-text">P</p><!-- /wp:auvyx/text -->';
		auvyx_assert_same( false, ContentTypes::content_binds( '<p>x</p>', ContentTypes::type( 'property' ) ) );
		auvyx_assert_same( true, ContentTypes::content_binds( $bound, ContentTypes::type( 'property' ) ) );
		wp_reset_postdata();
		$wp_query     = $saved_query; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		$wp_the_query = $saved_query; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		auvyx_assert_not_contains( 'auvyx-fields', (string) apply_filters( 'the_content', '<p>Nice.</p>' ), 'outside the main loop: nothing added' );

		// The archive: /property/ resolves to the type's entries.
		$structure = (string) get_option( 'permalink_structure' );
		$wp_rewrite->set_permalink_structure( '/%postname%/' );
		Plugin::instance()->module( 'content-types' )->register_types();
		flush_rewrite_rules( false );
		$link = (string) get_post_type_archive_link( 'property' );
		auvyx_assert_contains( '/property/', $link );
		$saved_uri              = $_SERVER['REQUEST_URI'] ?? '';
		$_SERVER['REQUEST_URI'] = (string) wp_parse_url( $link, PHP_URL_PATH );
		$wp                     = new WP();
		$wp->parse_request();
		$_SERVER['REQUEST_URI'] = $saved_uri;
		auvyx_assert_same( 'property', $wp->query_vars['post_type'] ?? '' );
		$archive = new WP_Query( $wp->query_vars );
		auvyx_assert_same( true, $archive->is_post_type_archive() );
		auvyx_assert_same( array( $id ), wp_list_pluck( $archive->posts, 'ID' ) );
		$wp_rewrite->set_permalink_structure( $structure );
		flush_rewrite_rules( false );

		wp_set_current_user( 1 );
		wp_delete_post( $id, true );
		wp_delete_post( $agent, true );
		auvyx_ct_teardown();
	}
);

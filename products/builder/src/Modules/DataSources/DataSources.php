<?php
/**
 * Data from anywhere (docs/ai-full-power.md, layer 4): REST or GraphQL endpoints the administrator names, listed by
 * Posts loops (`"source": "data/<name>"`) and shown by bound elements (`data/<field>`), rendered on the server.
 *
 * The server asks the endpoint (header values such as tokens are encrypted like the AI key and never shown back) and
 * keeps the answer for the source's `ttl`; when the endpoint fails, the last good answer is used for a day. What a
 * source may be and how its answer becomes items mirror the Studio's DataSources.scala:
 * shared/fixtures/data-sources/cases.json runs on both.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\DataSources;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\Ai\Ai;

defined( 'ABSPATH' ) || exit;

final class DataSources implements Module {

	const OPTION     = 'auvyx_data_sources';
	const PREFIX     = 'data/';
	const NAME       = '/^[a-z0-9_]{1,40}$/';
	const HEADER     = '/^[A-Za-z0-9-]{1,60}$/';
	const PATH       = '/^[A-Za-z0-9_$@:\-]+(\.[A-Za-z0-9_$@:\-]+)*$/';
	const MAX_ITEMS  = 50;
	const MAX_FIELDS = 30;
	const MAX_BODY   = 20000;
	const MAX_TTL    = 86400;
	const STALE      = DAY_IN_SECONDS;
	/** A public source is read by anyone: its endpoint is asked at most once a minute. */
	const MIN_PUBLIC_TTL = 60;

	public function id(): string {
		return 'data-sources';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_rest' ) );
	}

	// ---- what a source may be, and what its answer becomes (parity with DataSources.scala) ----

	/**
	 * A spec as given, normalized, or why not.
	 *
	 * @param mixed $spec Spec (array).
	 * @return array<string, mixed>|string
	 */
	public static function validate( $spec ) {
		if ( ! is_array( $spec ) ) {
			return 'Not a source';
		}
		$name    = (string) ( $spec['name'] ?? '' );
		$url     = (string) ( $spec['url'] ?? '' );
		$method  = strtoupper( (string) ( $spec['method'] ?? 'GET' ) );
		$method  = '' === $method ? 'GET' : $method;
		$headers = is_array( $spec['headers'] ?? null ) ? $spec['headers'] : array();
		$body    = (string) ( $spec['body'] ?? '' );
		$list    = (string) ( $spec['list'] ?? '' );
		$fields  = is_array( $spec['fields'] ?? null ) ? $spec['fields'] : array();
		$ttl     = isset( $spec['ttl'] ) ? (int) $spec['ttl'] : 300;
		if ( 1 !== preg_match( self::NAME, $name ) ) {
			return 'A name is 1 to 40 lowercase letters, digits or _';
		}
		if ( 1 !== preg_match( '#^https?://[^\s"\'<>]{3,2000}$#i', $url ) ) {
			return 'The address starts with https:// (or http://)';
		}
		if ( 'GET' !== $method && 'POST' !== $method ) {
			return 'GET or POST';
		}
		if ( count( $headers ) > 20 ) {
			return 'A header is a name and one line';
		}
		foreach ( $headers as $key => $value ) {
			if ( ! is_string( $key ) || 1 !== preg_match( self::HEADER, $key ) || ! is_string( $value ) || strlen( $value ) > 4000 || false !== strpbrk( $value, "\r\n" ) ) {
				return 'A header is a name and one line';
			}
		}
		if ( strlen( $body ) > self::MAX_BODY ) {
			return 'A body is at most ' . self::MAX_BODY . ' characters';
		}
		if ( '' !== $body && 'GET' === $method ) {
			return 'Only a POST sends a body';
		}
		if ( '' !== $list && 1 !== preg_match( self::PATH, $list ) ) {
			return 'The list path is names and indexes joined by dots (data.items)';
		}
		if ( array() === $fields || count( $fields ) > self::MAX_FIELDS ) {
			return 'Name 1 to ' . self::MAX_FIELDS . ' fields';
		}
		foreach ( $fields as $key => $path ) {
			if ( ! is_string( $key ) || 1 !== preg_match( self::NAME, $key ) || ! is_string( $path ) || 1 !== preg_match( self::PATH, $path ) ) {
				return 'A field is a name (lowercase, digits, _) and a path (price.amount)';
			}
		}
		if ( $ttl < 0 || $ttl > self::MAX_TTL ) {
			return 'Keep an answer 0 to ' . self::MAX_TTL . ' seconds';
		}
		if ( true === ( $spec['public'] ?? false ) && $ttl < self::MIN_PUBLIC_TTL ) {
			return 'A public source keeps its answer at least ' . self::MIN_PUBLIC_TTL . ' seconds';
		}
		$label = trim( (string) ( $spec['label'] ?? '' ) );
		return array(
			'name'    => $name,
			'label'   => '' === $label ? $name : mb_substr( $label, 0, 80 ),
			'url'     => $url,
			'method'  => $method,
			'headers' => $headers,
			'body'    => $body,
			'list'    => $list,
			'fields'  => $fields,
			'ttl'     => $ttl,
			'public'  => true === ( $spec['public'] ?? false ),
		);
	}

	/**
	 * The value at `path` (dots; a number indexes a list), or null.
	 *
	 * @param mixed $json Decoded JSON (associative arrays).
	 * @return mixed|null
	 */
	public static function at( $json, string $path ) {
		if ( '' === $path ) {
			return $json;
		}
		$current = $json;
		foreach ( explode( '.', $path ) as $step ) {
			if ( ! is_array( $current ) ) {
				return null;
			}
			if ( self::is_list( $current ) ) {
				if ( 1 !== preg_match( '/^-?\d+$/', $step ) || (int) $step < 0 || (int) $step >= count( $current ) ) {
					return null;
				}
				$current = $current[ (int) $step ];
			} elseif ( array_key_exists( $step, $current ) ) {
				$current = $current[ $step ];
			} else {
				return null;
			}
		}
		return $current;
	}

	/**
	 * A field's text: strings as they are, numbers without a needless ".0", true/false; anything else is no value.
	 *
	 * @param mixed $value Value.
	 */
	public static function text( $value ): ?string {
		if ( is_string( $value ) ) {
			return $value;
		}
		if ( is_bool( $value ) ) {
			return $value ? 'true' : 'false';
		}
		if ( is_int( $value ) ) {
			return (string) $value;
		}
		if ( is_float( $value ) ) {
			return floor( $value ) === $value && abs( $value ) < 1e15 ? (string) (int) $value : (string) $value;
		}
		return null;
	}

	/**
	 * The items of a decoded answer: each item's fields by `data/<name>`, at most `limit`.
	 *
	 * @param mixed                $answer Decoded JSON.
	 * @param array<string, mixed> $spec   Valid spec.
	 * @return array<int, array<string, string>>
	 */
	public static function items( $answer, array $spec, int $limit = self::MAX_ITEMS ): array {
		$found = self::at( $answer, (string) $spec['list'] );
		if ( ! is_array( $found ) || ( array() === $found && ! self::is_list( $found ) ) ) {
			$rows = array();
		} elseif ( self::is_list( $found ) ) {
			$rows = $found;
		} else {
			$rows = array( $found );
		}
		$out = array();
		foreach ( array_slice( $rows, 0, max( 0, min( $limit, self::MAX_ITEMS ) ) ) as $row ) {
			$item = array();
			foreach ( $spec['fields'] as $name => $path ) {
				$value = self::text( self::at( $row, (string) $path ) );
				if ( null !== $value ) {
					$item[ self::PREFIX . $name ] = mb_substr( $value, 0, 5000 );
				}
			}
			$out[] = $item;
		}
		return $out;
	}

	/**
	 * Items from an answer's text; a GraphQL answer with only `errors`, or text that is not JSON, is an error.
	 *
	 * @param array<string, mixed> $spec Valid spec.
	 * @return array<int, array<string, string>>|\WP_Error
	 */
	public static function parse( string $answer, array $spec, int $limit = self::MAX_ITEMS ) {
		$json = json_decode( $answer, true );
		if ( null === $json && 'null' !== trim( $answer ) ) {
			return new \WP_Error( 'auvyx_data_json', 'The answer is not JSON' );
		}
		if ( is_array( $json ) && ! self::is_list( $json ) && array_key_exists( 'errors', $json ) && empty( $json['data'] ) ) {
			return new \WP_Error( 'auvyx_data_errors', 'The endpoint answered with errors: ' . substr( (string) wp_json_encode( $json['errors'] ), 0, 300 ) );
		}
		return self::items( $json, $spec, $limit );
	}

	/**
	 * A JSON list (not an object). `[]` decodes the same for both; it counts as a list.
	 *
	 * @param array<mixed> $value Array.
	 */
	private static function is_list( array $value ): bool {
		return array() === $value || array_keys( $value ) === range( 0, count( $value ) - 1 );
	}

	// ---- the sources this site has --------------------------------------------------------------

	/**
	 * Saved sources by name; header values decrypted only when asked for.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public static function all( bool $with_secrets = false ): array {
		$out = array();
		foreach ( (array) get_option( self::OPTION, array() ) as $stored ) {
			$spec = self::validate( is_array( $stored ) ? array_merge( $stored, array( 'headers' => array() ) ) : null );
			if ( ! is_array( $spec ) ) {
				continue;
			}
			foreach ( (array) ( $stored['headers'] ?? array() ) as $key => $value ) {
				$spec['headers'][ $key ] = $with_secrets ? Ai::decrypt( (string) $value ) : '';
			}
			$out[ $spec['name'] ] = $spec;
		}
		return $out;
	}

	/**
	 * Saves one source. A header sent without a value keeps the stored one (the Studio never sees it).
	 *
	 * @param array<string, mixed> $spec Valid spec.
	 */
	public static function save( array $spec ): void {
		$stored = (array) get_option( self::OPTION, array() );
		$before = array();
		foreach ( $stored as $item ) {
			if ( is_array( $item ) && ( $item['name'] ?? '' ) === $spec['name'] ) {
				$before = (array) ( $item['headers'] ?? array() );
			}
		}
		$headers = array();
		foreach ( $spec['headers'] as $key => $value ) {
			$headers[ $key ] = '' === $value ? (string) ( $before[ $key ] ?? '' ) : Ai::encrypt( $value );
		}
		$spec['headers'] = $headers;
		$kept            = array_values( array_filter( $stored, static fn( $item ) => is_array( $item ) && ( $item['name'] ?? '' ) !== $spec['name'] ) );
		$kept[]          = $spec;
		update_option( self::OPTION, array_slice( $kept, -30 ), false );
		delete_transient( self::cache_key( $spec['name'] ) );
	}

	public static function remove( string $name ): void {
		$stored = array_values( array_filter( (array) get_option( self::OPTION, array() ), static fn( $item ) => is_array( $item ) && ( $item['name'] ?? '' ) !== $name ) );
		update_option( self::OPTION, $stored, false );
		delete_transient( self::cache_key( $name ) );
		delete_transient( self::cache_key( $name ) . '_ok' );
	}

	private static function cache_key( string $name ): string {
		return 'auvyx_ds_' . $name;
	}

	/**
	 * Asks the endpoint (WordPress's safe request: no local addresses, bounded size and time): its answer's text.
	 *
	 * @param array<string, mixed> $spec Spec with header values.
	 * @return string|\WP_Error
	 */
	private static function request( array $spec ) {
		$headers = array_merge( array( 'Accept' => 'application/json' ), $spec['headers'] );
		if ( '' !== $spec['body'] && ! isset( array_change_key_case( $headers )['content-type'] ) ) {
			$headers['Content-Type'] = 'application/json';
		}
		/**
		 * Filters the arguments of a data source's request (a site that must reach a private address can use another transport here).
		 *
		 * @param array<string, mixed> $args Request arguments.
		 * @param string               $name Source name.
		 */
		$args     = (array) apply_filters(
			'auvyx_builder_data_source_request',
			array(
				'method'              => $spec['method'],
				'headers'             => $headers,
				'body'                => '' === $spec['body'] ? null : $spec['body'],
				'timeout'             => 8,
				'redirection'         => 2,
				'limit_response_size' => 2 * MB_IN_BYTES,
			),
			$spec['name']
		);
		$response = wp_safe_remote_request( $spec['url'], $args );
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			return new \WP_Error( 'auvyx_data_status', 'The endpoint answered ' . $code );
		}
		return (string) wp_remote_retrieve_body( $response );
	}

	/**
	 * The source's items now (no copy kept).
	 *
	 * @param array<string, mixed> $spec Spec with header values.
	 * @return array<int, array<string, string>>|\WP_Error
	 */
	public static function fetch( array $spec, int $limit = self::MAX_ITEMS ) {
		$body = self::request( $spec );
		return is_wp_error( $body ) ? $body : self::parse( $body, $spec, $limit );
	}

	/**
	 * What the dialog shows after asking a source: a few items, the first item as the endpoint gave it, the error if any.
	 *
	 * @param array<string, mixed> $spec Spec with header values.
	 * @return array{items: array<int, array<string, string>>, sample: string, error: string}
	 */
	public static function answer( array $spec, int $limit = 5 ): array {
		$body = self::request( $spec );
		if ( is_wp_error( $body ) ) {
			return array(
				'items'  => array(),
				'sample' => '',
				'error'  => $body->get_error_message(),
			);
		}
		$items = self::parse( $body, $spec, $limit );
		$found = self::at( json_decode( $body, true ), (string) $spec['list'] );
		$first = is_array( $found ) && self::is_list( $found ) ? ( $found[0] ?? null ) : $found;
		return array(
			'items'  => is_wp_error( $items ) ? array() : $items,
			'sample' => null === $first ? '' : substr( (string) wp_json_encode( $first, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ), 0, 4000 ),
			'error'  => is_wp_error( $items ) ? $items->get_error_message() : '',
		);
	}

	/**
	 * A source's items for a page: kept for its ttl; when the endpoint fails, the last good answer (a day at most), else none.
	 *
	 * @return array<int, array<string, string>>
	 */
	public static function items_for( string $name, int $limit = self::MAX_ITEMS ): array {
		$all = self::all( true );
		if ( ! isset( $all[ $name ] ) ) {
			return array();
		}
		$spec   = $all[ $name ];
		$key    = self::cache_key( $name );
		$cached = $spec['ttl'] > 0 ? get_transient( $key ) : false;
		if ( is_array( $cached ) ) {
			return array_slice( $cached, 0, $limit );
		}
		$items = self::fetch( $spec );
		if ( is_wp_error( $items ) ) {
			$stale = get_transient( $key . '_ok' );
			return is_array( $stale ) ? array_slice( $stale, 0, $limit ) : array();
		}
		if ( $spec['ttl'] > 0 ) {
			set_transient( $key, $items, $spec['ttl'] );
		}
		set_transient( $key . '_ok', $items, self::STALE );
		return array_slice( $items, 0, $limit );
	}

	/**
	 * Loop sources and fields for the Studio (Data::studio_config).
	 *
	 * @return array{sources: array<int, array<string, string>>, fields: array<int, array<string, string>>}
	 */
	public static function studio_config(): array {
		$sources = array();
		$fields  = array();
		foreach ( self::all() as $spec ) {
			$sources[] = array(
				'key'      => self::PREFIX . $spec['name'],
				'label'    => $spec['label'],
				'postType' => 'data',
			);
			foreach ( array_keys( $spec['fields'] ) as $field ) {
				$shape    = 1 === preg_match( '/image|photo|picture|thumbnail|avatar|logo|icon/', $field ) ? 'image' : ( 1 === preg_match( '/url|link|href/', $field ) ? 'url' : 'text' );
				$fields[] = array(
					'key'   => self::PREFIX . $field,
					'label' => ucfirst( str_replace( '_', ' ', $field ) ),
					'group' => 'Data: ' . $spec['label'],
					'shape' => $shape,
				);
			}
		}
		return array(
			'sources' => $sources,
			'fields'  => $fields,
		);
	}

	/** Field keys a binding may use: `data/<field>`. */
	public static function is_field( string $key ): bool {
		return 0 === strpos( $key, self::PREFIX ) && 1 === preg_match( self::NAME, substr( $key, strlen( self::PREFIX ) ) );
	}

	/** The source name of a loop's `source`, or ''. */
	public static function source_name( string $source ): string {
		$name = 0 === strpos( $source, self::PREFIX ) ? substr( $source, strlen( self::PREFIX ) ) : '';
		return 1 === preg_match( self::NAME, $name ) ? $name : '';
	}

	// ---- REST (the Studio's Data sources dialog) ---------------------------------------------------

	public function register_rest(): void {
		$admin = static function () {
			return current_user_can( 'manage_options' );
		};
		register_rest_route(
			'auvyx/v1',
			'/data-sources',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => static fn() => new \WP_REST_Response( array_values( self::all() ) ),
					'permission_callback' => static fn() => current_user_can( 'edit_posts' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'rest_save' ),
					'permission_callback' => $admin,
				),
			)
		);
		// The public data address (docs/ai-full-power.md): a code element's script loads a public source's items again
		// (`source(name)`). Only the fields the administrator named, from the kept answer; never the headers or the answer.
		register_rest_route(
			'auvyx/v1',
			'/data/(?P<name>[a-z0-9_]{1,40})',
			array(
				'methods'             => 'GET',
				'callback'            => static function ( $request ) {
					$spec = self::all()[ (string) $request['name'] ] ?? null;
					if ( ! is_array( $spec ) || true !== $spec['public'] ) {
						return new \WP_REST_Response( array( 'message' => 'No such data' ), 404 );
					}
					$response = new \WP_REST_Response( self::items_for( $spec['name'], self::MAX_ITEMS ) );
					$response->header( 'Cache-Control', 'public, max-age=' . min( 300, max( 0, (int) $spec['ttl'] ) ) );
					return $response;
				},
				'permission_callback' => '__return_true',
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/data-sources/test',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_test' ),
				'permission_callback' => $admin,
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/data-sources/(?P<name>[a-z0-9_]{1,40})',
			array(
				array(
					'methods'             => 'DELETE',
					'callback'            => static function ( $request ) {
						self::remove( (string) $request['name'] );
						return new \WP_REST_Response( array( 'deleted' => true ) );
					},
					'permission_callback' => $admin,
				),
				array(
					'methods'             => 'GET',
					'callback'            => static function ( $request ) {
						return new \WP_REST_Response( self::items_for( (string) $request['name'], min( self::MAX_ITEMS, max( 1, absint( $request->get_param( 'limit' ) ? $request->get_param( 'limit' ) : 12 ) ) ) ) );
					},
					'permission_callback' => static fn() => current_user_can( 'edit_posts' ),
				),
			)
		);
	}

	/**
	 * The spec of a request, with stored header values filled in where the Studio sent none.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array<string, mixed>|string
	 */
	private static function requested( $request ) {
		$spec = self::validate( $request->get_json_params() );
		if ( ! is_array( $spec ) ) {
			return $spec;
		}
		$stored = self::all( true )[ $spec['name'] ] ?? array( 'headers' => array() );
		foreach ( $spec['headers'] as $key => $value ) {
			if ( '' === $value ) {
				$spec['headers'][ $key ] = (string) ( $stored['headers'][ $key ] ?? '' );
			}
		}
		return $spec;
	}

	/**
	 * Saves a source after asking it once: what it answered comes back (a few items), so the dialog shows the fields filled in.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	public function rest_save( $request ): \WP_REST_Response {
		$spec = self::requested( $request );
		if ( ! is_array( $spec ) ) {
			return new \WP_REST_Response( array( 'message' => $spec ), 400 );
		}
		$answer = self::answer( $spec );
		self::save( self::validate( $request->get_json_params() ) );
		return new \WP_REST_Response( $answer );
	}

	/**
	 * Asks a source without saving it.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	public function rest_test( $request ): \WP_REST_Response {
		$spec = self::requested( $request );
		if ( ! is_array( $spec ) ) {
			return new \WP_REST_Response( array( 'message' => $spec ), 400 );
		}
		return new \WP_REST_Response( self::answer( $spec ) );
	}
}

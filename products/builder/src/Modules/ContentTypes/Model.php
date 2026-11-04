<?php
/**
 * The PHP mirror of the Studio's ContentModel.scala: what a content definition may be (`validate`), what a sent value
 * becomes (`sanitize`) and how a kept value reads (`display`). Error messages, their order and every edge case follow
 * the Scala code; shared/fixtures/content-types/cases.json runs on both.
 *
 * JSON comes in decoded either with objects as `stdClass` (exact: `{}` and `[]` stay different) or as associative
 * arrays (then a non-empty array with string keys is an object and `[]` is a list).
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\ContentTypes;

defined( 'ABSPATH' ) || exit;

final class Model {

	const SCHEMA = 'auvyx-content/1';

	const KINDS = array(
		'text'     => 'Text',
		'textarea' => 'Long text',
		'number'   => 'Number',
		'money'    => 'Price',
		'date'     => 'Date',
		'time'     => 'Time',
		'datetime' => 'Date and time',
		'select'   => 'Choice',
		'checkbox' => 'Yes / no',
		'url'      => 'Link',
		'email'    => 'Email',
		'phone'    => 'Phone',
		'color'    => 'Colour',
		'image'    => 'Image',
		'gallery'  => 'Gallery',
		'file'     => 'File',
		'relation' => 'Link to another entry',
		'repeater' => 'Rows',
	);

	const MAX_TYPES      = 30;
	const MAX_TAXONOMIES = 30;
	const MAX_FIELDS     = 60;
	const MAX_SUB_FIELDS = 20;
	const MAX_OPTIONS    = 100;
	const MAX_ROWS       = 50;
	const MAX_GALLERY    = 40;
	const MAX_TEXT       = 500;
	const MAX_LONG       = 20000;

	const TYPE_KEY  = '/^[a-z][a-z0-9_]{0,19}$/D';
	const TAX_KEY   = '/^[a-z][a-z0-9_]{0,31}$/D';
	const FIELD_KEY = '/^[a-z][a-z0-9_]{0,39}$/D';
	const SLUG      = '/^[a-z0-9][a-z0-9-]{0,39}$/D';
	const ICON      = '/^[a-z0-9-]{1,40}$/D';

	const RESERVED_TYPES = array( 'post', 'page', 'attachment', 'revision', 'nav_menu_item', 'custom_css', 'customize_changeset', 'oembed_cache', 'user_request', 'wp_block', 'wp_template', 'wp_template_part', 'wp_global_styles', 'wp_navigation', 'wp_font_family', 'wp_font_face', 'action', 'author', 'order', 'theme', 'product', 'product_variation', 'shop_order', 'shop_coupon', 'shop_order_refund', 'auvyx_site_template', 'auvyx_form_entry', 'auvyx_game', 'auvyx_data_source', 'type', 'types', 'fields' );

	const RESERVED_TAXONOMIES = array( 'category', 'post_tag', 'nav_menu', 'link_category', 'post_format', 'wp_theme', 'wp_template_part_area', 'wp_pattern_category', 'product_cat', 'product_tag', 'product_type', 'product_visibility', 'product_shipping_class', 'attachment', 'author', 'day', 'feed', 'hour', 'm', 'minute', 'monthnum', 'name', 'order', 'orderby', 'p', 'page', 'paged', 'post', 's', 'search', 'second', 'static', 'tag', 'taxonomy', 'term', 'terms', 'theme', 'type', 'w', 'year' );

	const RESERVED_FIELDS = array( 'title', 'content', 'excerpt', 'slug', 'status', 'date', 'author', 'id', 'type', 'thumbnail', 'parent', 'menu_order' );

	const SUPPORTS = array( 'title', 'editor', 'thumbnail', 'excerpt', 'comments', 'revisions', 'page-attributes' );

	const DEFAULT_SUPPORTS = array( 'title', 'editor', 'thumbnail', 'excerpt' );

	/** Types outside the definition a link or a taxonomy may name. */
	const BUILT_IN = array( 'post', 'page', 'product' );

	const EMAIL  = '/^[^\s@<>"\']{1,64}@[^\s@<>"\']{1,253}\.[^\s@<>"\']{2,}$/uD';
	const PHONE  = '/^[0-9+()\-.\s]{3,30}$/D';
	const DAY    = '/^\d{4}-\d{2}-\d{2}$/D';
	const CLOCK  = '/^([01]\d|2[0-3]):[0-5]\d$/D';
	const MOMENT = '/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/D';
	const HEX    = '/^#[0-9a-f]{6}$/D';
	const LINK   = '/^(https?:\/\/[^\s<>"\']{1,2000}|\/[^\s<>"\']{0,2000})$/uD';

	// ---- JSON shapes ----------------------------------------------------------------------------

	/**
	 * A JSON list (`[]` counts as a list).
	 *
	 * @param mixed $value Value.
	 */
	public static function is_list( $value ): bool {
		if ( ! is_array( $value ) ) {
			return false;
		}
		$i = 0;
		foreach ( array_keys( $value ) as $key ) {
			if ( $key !== $i ) {
				return false;
			}
			++$i;
		}
		return true;
	}

	/**
	 * A JSON object's members, or null when the value is not an object.
	 *
	 * @param mixed $value Value.
	 * @return array<string, mixed>|null
	 */
	public static function obj( $value ): ?array {
		if ( $value instanceof \stdClass ) {
			return get_object_vars( $value );
		}
		return is_array( $value ) && array() !== $value && ! self::is_list( $value ) ? $value : null;
	}

	/**
	 * @param mixed $value Value.
	 */
	private static function is_num( $value ): bool {
		return ( is_int( $value ) || is_float( $value ) ) && ! ( is_float( $value ) && ( is_nan( $value ) || is_infinite( $value ) ) );
	}

	/** Scala's `trim`: every character up to U+0020 off both ends. */
	private static function trim( string $s ): string {
		return (string) preg_replace( '/^[\x00-\x20]+|[\x00-\x20]+$/D', '', $s );
	}

	/** Length in UTF-16 code units, as the JVM and JavaScript count. */
	public static function length( string $s ): int {
		if ( 1 === preg_match( '/^[\x00-\x7F]*$/D', $s ) ) {
			return strlen( $s );
		}
		return (int) ( strlen( (string) mb_convert_encoding( $s, 'UTF-16LE', 'UTF-8' ) ) / 2 );
	}

	/** The first `$max` UTF-16 code units (never half a character). */
	private static function take( string $s, int $max ): string {
		if ( self::length( $s ) <= $max ) {
			return $s;
		}
		$out = '';
		$n   = 0;
		foreach ( (array) mb_str_split( $s, 1, 'UTF-8' ) as $char ) {
			$w = strlen( (string) $char ) >= 4 ? 2 : 1;
			if ( $n + $w > $max ) {
				break;
			}
			$out .= $char;
			$n   += $w;
		}
		return $out;
	}

	/**
	 * Distinct strings, first occurrence kept.
	 *
	 * @param array<int, string> $values Values.
	 * @return array<int, string>
	 */
	private static function distinct( array $values ): array {
		$seen = array();
		$out  = array();
		foreach ( $values as $value ) {
			$k = is_string( $value ) ? 's' . $value : 'n' . (string) $value;
			if ( ! isset( $seen[ $k ] ) ) {
				$seen[ $k ] = true;
				$out[]      = $value;
			}
		}
		return $out;
	}

	/**
	 * @param array<int, string> $values Values.
	 */
	private static function has_repeats( array $values ): bool {
		return count( self::distinct( $values ) ) !== count( $values );
	}

	// ---- numbers as the JVM writes them -----------------------------------------------------------

	/**
	 * The shortest decimal digits of a double and its exponent: 1234.5 → ['12345', 3].
	 *
	 * @return array{0: string, 1: int}
	 */
	private static function digits( float $n ): array {
		$abs = abs( $n );
		$e   = sprintf( '%.16e', $abs );
		for ( $p = 0; $p <= 16; $p++ ) {
			$e = sprintf( '%.' . $p . 'e', $abs );
			if ( (float) $e === $abs ) {
				break;
			}
		}
		preg_match( '/^(\d)(?:\.(\d+))?e([+-]\d+)$/', $e, $m );
		$digits = rtrim( $m[1] . ( $m[2] ?? '' ), '0' );
		return array( '' === $digits ? '0' : $digits, (int) $m[3] );
	}

	/** Plain decimal notation without trailing zeros (BigDecimal#stripTrailingZeros#toPlainString). */
	private static function plain( float $n ): string {
		if ( 0.0 === $n ) {
			return '0';
		}
		list( $digits, $exp ) = self::digits( $n );
		$len                  = strlen( $digits );
		if ( $exp >= $len - 1 ) {
			$out = $digits . str_repeat( '0', $exp - $len + 1 );
		} elseif ( $exp >= 0 ) {
			$out = substr( $digits, 0, $exp + 1 ) . '.' . substr( $digits, $exp + 1 );
		} else {
			$out = '0.' . str_repeat( '0', -$exp - 1 ) . $digits;
		}
		return ( $n < 0 ? '-' : '' ) . $out;
	}

	/** java.lang.Double#toString. */
	private static function java_double( float $n ): string {
		if ( 0.0 === $n ) {
			return '0.0';
		}
		$abs = abs( $n );
		if ( $abs >= 1e-3 && $abs < 1e7 ) {
			$plain = self::plain( $n );
			return false === strpos( $plain, '.' ) ? $plain . '.0' : $plain;
		}
		list( $digits, $exp ) = self::digits( $n );
		$rest                 = substr( $digits, 1 );
		return ( $n < 0 ? '-' : '' ) . $digits[0] . '.' . ( '' === $rest || false === $rest ? '0' : $rest ) . 'E' . $exp;
	}

	/** A whole number below 1e15 as an integer, anything else in plain decimals. */
	public static function show( float $n ): string {
		if ( floor( $n ) === $n && abs( $n ) < 1e15 ) {
			return (string) (int) $n;
		}
		return self::plain( $n );
	}

	/** Scala's math.round (half up). */
	private static function round_half_up( float $n ): float {
		return floor( $n + 0.5 );
	}

	/** Groups of three digits, two decimals: 1234.5 → "1,234.50". */
	public static function money( float $n, string $sep = ',', string $point = '.' ): string {
		$cents = (int) self::round_half_up( abs( $n ) * 100 );
		$whole = strrev( implode( strrev( $sep ), str_split( strrev( (string) intdiv( $cents, 100 ) ), 3 ) ) );
		return ( $n < 0 ? '-' : '' ) . $whole . $point . sprintf( '%02d', $cents % 100 );
	}

	// ---- a definition -----------------------------------------------------------------------------

	/**
	 * A definition from decoded JSON, checked. Errors name where they are, in order; a definition with any error is
	 * refused whole.
	 *
	 * @param mixed $json Decoded JSON.
	 * @return array{errors: array<int, string>, definition: array<string, mixed>|null} `definition` is the internal shape
	 *         (see to_json for the stored one).
	 */
	public static function validate( $json ): array {
		$errors = array();
		$err    = static function ( string $path, string $what ) use ( &$errors ): void {
			$errors[] = $path . ': ' . $what;
		};
		$root   = self::obj( $json );
		if ( null === $root ) {
			return array(
				'errors'     => array( 'definition: not an object' ),
				'definition' => null,
			);
		}
		$raw_types = self::arr( $root, 'types' );
		$raw_taxes = self::arr( $root, 'taxonomies' );
		if ( count( $raw_types ) > self::MAX_TYPES ) {
			$err( 'types', 'more than ' . self::MAX_TYPES );
		}
		if ( count( $raw_taxes ) > self::MAX_TAXONOMIES ) {
			$err( 'taxonomies', 'more than ' . self::MAX_TAXONOMIES );
		}
		$types = array();
		foreach ( $raw_types as $i => $v ) {
			$path = 'types[' . $i . ']';
			$t    = self::obj( $v );
			if ( null === $t ) {
				$err( $path, 'not an object' );
				continue;
			}
			$key = self::str( $t, 'key' );
			if ( 1 !== preg_match( self::TYPE_KEY, $key ) ) {
				$err( $path . '.key', 'lower-case letters, digits and _ (start with a letter, at most 20)' );
			} elseif ( in_array( $key, self::RESERVED_TYPES, true ) ) {
				$err( $path . '.key', 'reserved' );
			}
			$slug = self::str( $t, 'slug' );
			$slug = '' === $slug ? str_replace( '_', '-', $key ) : $slug;
			if ( 1 !== preg_match( self::SLUG, $slug ) ) {
				$err( $path . '.slug', 'lower-case letters, digits and - (at most 40)' );
			}
			$supports = array();
			foreach ( self::arr( $t, 'supports' ) as $s ) {
				if ( is_string( $s ) ) {
					$supports[] = $s;
				}
			}
			$supports = self::distinct( $supports );
			foreach ( $supports as $s ) {
				if ( ! in_array( $s, self::SUPPORTS, true ) ) {
					$err( $path . '.supports', 'unknown "' . $s . '"' );
				}
			}
			$raw_fields = self::arr( $t, 'fields' );
			if ( count( $raw_fields ) > self::MAX_FIELDS ) {
				$err( $path . '.fields', 'more than ' . self::MAX_FIELDS );
			}
			$fields = array();
			foreach ( $raw_fields as $j => $f ) {
				$field = self::field( $f, $path . '.fields[' . $j . ']', false, $err );
				if ( null !== $field ) {
					$fields[] = $field;
				}
			}
			if ( self::has_repeats( array_column( $fields, 'key' ) ) ) {
				$err( $path . '.fields', 'two fields with the same key' );
			}
			$icon = self::str( $t, 'icon' );
			if ( '' !== $icon && 1 !== preg_match( self::ICON, $icon ) ) {
				$err( $path . '.icon', 'an icon name' );
			}
			$name     = self::label( $t, 'label', $path, $key, $err );
			$singular = self::label( $t, 'singular', $path, $name, $err );
			$types[]  = array(
				'key'      => $key,
				'label'    => $name,
				'singular' => $singular,
				'slug'     => $slug,
				'icon'     => $icon,
				'public'   => self::bool( $t, 'public', true ),
				'archive'  => self::bool( $t, 'archive', true ),
				'supports' => array_key_exists( 'supports', $t ) ? array_values( array_filter( $supports, static fn( $s ) => in_array( $s, self::SUPPORTS, true ) ) ) : self::DEFAULT_SUPPORTS,
				'fields'   => $fields,
			);
		}
		$type_keys = array_column( $types, 'key' );
		if ( self::has_repeats( $type_keys ) ) {
			$err( 'types', 'two types with the same key' );
		}
		if ( self::has_repeats( array_column( $types, 'slug' ) ) ) {
			$err( 'types', 'two types with the same slug' );
		}
		foreach ( $types as $i => $t ) {
			$all = $t['fields'];
			foreach ( $t['fields'] as $f ) {
				$all = array_merge( $all, $f['fields'] );
			}
			foreach ( $all as $f ) {
				if ( 'relation' === $f['kind'] && '' !== $f['to'] && ! in_array( $f['to'], $type_keys, true ) && ! in_array( $f['to'], self::BUILT_IN, true ) ) {
					$err( 'types[' . $i . '].fields.' . $f['key'] . '.to', 'no content type "' . $f['to'] . '"' );
				}
			}
		}
		$taxonomies = array();
		foreach ( $raw_taxes as $i => $v ) {
			$path = 'taxonomies[' . $i . ']';
			$t    = self::obj( $v );
			if ( null === $t ) {
				$err( $path, 'not an object' );
				continue;
			}
			$key = self::str( $t, 'key' );
			if ( 1 !== preg_match( self::TAX_KEY, $key ) ) {
				$err( $path . '.key', 'lower-case letters, digits and _ (start with a letter, at most 32)' );
			} elseif ( in_array( $key, self::RESERVED_TAXONOMIES, true ) || in_array( $key, self::RESERVED_TYPES, true ) ) {
				$err( $path . '.key', 'reserved' );
			}
			$slug = self::str( $t, 'slug' );
			$slug = '' === $slug ? str_replace( '_', '-', $key ) : $slug;
			if ( 1 !== preg_match( self::SLUG, $slug ) ) {
				$err( $path . '.slug', 'lower-case letters, digits and - (at most 40)' );
			}
			$on = array();
			foreach ( self::arr( $t, 'types' ) as $s ) {
				if ( is_string( $s ) ) {
					$on[] = self::trim( $s );
				}
			}
			$on = self::distinct( $on );
			foreach ( $on as $k ) {
				if ( ! in_array( $k, $type_keys, true ) && ! in_array( $k, self::BUILT_IN, true ) ) {
					$err( $path . '.types', 'no content type "' . $k . '"' );
				}
			}
			$name         = self::label( $t, 'label', $path, $key, $err );
			$singular     = self::label( $t, 'singular', $path, $name, $err );
			$taxonomies[] = array(
				'key'          => $key,
				'label'        => $name,
				'singular'     => $singular,
				'slug'         => $slug,
				'hierarchical' => self::bool( $t, 'hierarchical', true ),
				'types'        => $on,
			);
		}
		$tax_keys = array_column( $taxonomies, 'key' );
		if ( self::has_repeats( $tax_keys ) ) {
			$err( 'taxonomies', 'two taxonomies with the same key' );
		}
		foreach ( $tax_keys as $k ) {
			if ( in_array( $k, $type_keys, true ) ) {
				$err( 'taxonomies', '"' . $k . '" is also a content type' );
			}
		}
		if ( self::has_repeats( array_merge( array_column( $types, 'slug' ), array_column( $taxonomies, 'slug' ) ) ) ) {
			$err( 'taxonomies', 'a slug is used twice' );
		}
		if ( array() !== $errors ) {
			return array(
				'errors'     => $errors,
				'definition' => null,
			);
		}
		return array(
			'errors'     => array(),
			'definition' => array(
				'types'      => $types,
				'taxonomies' => $taxonomies,
			),
		);
	}

	/**
	 * One field, checked (errors through `$err`), or null when it is not an object.
	 *
	 * @param mixed    $v      Decoded JSON.
	 * @param string   $path   Where it is.
	 * @param bool     $nested Inside rows.
	 * @param callable $err    Error sink.
	 * @return array<string, mixed>|null
	 */
	private static function field( $v, string $path, bool $nested, callable $err ): ?array {
		$o = self::obj( $v );
		if ( null === $o ) {
			$err( $path, 'not an object' );
			return null;
		}
		$key  = self::str( $o, 'key' );
		$kind = self::str( $o, 'type' );
		$kind = '' === $kind ? 'text' : $kind;
		if ( 1 !== preg_match( self::FIELD_KEY, $key ) ) {
			$err( $path . '.key', 'lower-case letters, digits and _ (start with a letter, at most 40)' );
		} elseif ( in_array( $key, self::RESERVED_FIELDS, true ) ) {
			$err( $path . '.key', 'reserved' );
		}
		if ( ! isset( self::KINDS[ $kind ] ) ) {
			$err( $path . '.type', 'unknown type "' . $kind . '"' );
		}
		if ( $nested && 'repeater' === $kind ) {
			$err( $path . '.type', 'rows cannot hold rows' );
		}
		$options = array();
		foreach ( self::arr( $o, 'options' ) as $s ) {
			if ( is_string( $s ) && '' !== self::trim( $s ) ) {
				$options[] = self::take( self::trim( $s ), 120 );
			}
		}
		$options = self::distinct( $options );
		if ( 'select' === $kind && array() === $options ) {
			$err( $path . '.options', 'a choice needs options' );
		}
		if ( count( $options ) > self::MAX_OPTIONS ) {
			$err( $path . '.options', 'more than ' . self::MAX_OPTIONS );
		}
		$to = self::str( $o, 'to' );
		if ( 'relation' === $kind && 1 !== preg_match( self::TYPE_KEY, $to ) ) {
			$err( $path . '.to', 'names the content type it links to' );
		}
		$min = self::num( $o, 'min' );
		$max = self::num( $o, 'max' );
		if ( null !== $min && null !== $max && $min > $max ) {
			$err( $path . '.min', 'greater than max' );
		}
		$subs = self::arr( $o, 'fields' );
		if ( 'repeater' === $kind && array() === $subs ) {
			$err( $path . '.fields', 'rows need fields' );
		}
		if ( count( $subs ) > self::MAX_SUB_FIELDS ) {
			$err( $path . '.fields', 'more than ' . self::MAX_SUB_FIELDS );
		}
		$children = array();
		if ( 'repeater' === $kind ) {
			foreach ( $subs as $i => $s ) {
				$child = self::field( $s, $path . '.fields[' . $i . ']', true, $err );
				if ( null !== $child ) {
					$children[] = $child;
				}
			}
		}
		if ( self::has_repeats( array_column( $children, 'key' ) ) ) {
			$err( $path . '.fields', 'two fields with the same key' );
		}
		$help = self::str( $o, 'help' );
		if ( self::length( $help ) > 300 ) {
			$err( $path . '.help', 'longer than 300 characters' );
		}
		$numeric = 'number' === $kind || 'money' === $kind;
		return array(
			'key'      => $key,
			'label'    => self::label( $o, 'label', $path, $key, $err ),
			'kind'     => $kind,
			'required' => self::bool( $o, 'required', false ),
			'help'     => $help,
			'options'  => 'select' === $kind ? $options : array(),
			'multiple' => ( 'select' === $kind || 'relation' === $kind ) && self::bool( $o, 'multiple', false ),
			'min'      => $numeric ? $min : null,
			'max'      => $numeric ? $max : null,
			'to'       => 'relation' === $kind ? $to : '',
			'fields'   => $children,
		);
	}

	/**
	 * @param array<string, mixed> $o Object.
	 */
	private static function str( array $o, string $k ): string {
		return isset( $o[ $k ] ) && is_string( $o[ $k ] ) ? self::trim( $o[ $k ] ) : '';
	}

	/**
	 * @param array<string, mixed> $o Object.
	 */
	private static function bool( array $o, string $k, bool $fallback ): bool {
		return isset( $o[ $k ] ) && is_bool( $o[ $k ] ) ? $o[ $k ] : $fallback;
	}

	/**
	 * @param array<string, mixed> $o Object.
	 */
	private static function num( array $o, string $k ): ?float {
		return isset( $o[ $k ] ) && self::is_num( $o[ $k ] ) ? (float) $o[ $k ] : null;
	}

	/**
	 * @param array<string, mixed> $o Object.
	 * @return array<int, mixed>
	 */
	private static function arr( array $o, string $k ): array {
		return isset( $o[ $k ] ) && self::is_list( $o[ $k ] ) ? $o[ $k ] : array();
	}

	/**
	 * @param array<string, mixed> $o Object.
	 */
	private static function label( array $o, string $k, string $path, string $fallback, callable $err ): string {
		$l = self::str( $o, $k );
		if ( self::length( $l ) > 80 ) {
			$err( $path . '.' . $k, 'longer than 80 characters' );
		}
		return '' === $l ? $fallback : $l;
	}

	// ---- writing a definition --------------------------------------------------------------------

	/** A number as JSON keeps it: whole numbers as integers. */
	private static function json_number( float $n ) {
		return floor( $n ) === $n && abs( $n ) < 1e15 ? (int) $n : $n;
	}

	/**
	 * A field as stored (ContentModel.toJson).
	 *
	 * @param array<string, mixed> $f Field.
	 * @return array<string, mixed>
	 */
	public static function field_json( array $f ): array {
		$o = array(
			'key'   => $f['key'],
			'label' => $f['label'],
			'type'  => $f['kind'],
		);
		if ( $f['required'] ) {
			$o['required'] = true;
		}
		if ( '' !== $f['help'] ) {
			$o['help'] = $f['help'];
		}
		if ( array() !== $f['options'] ) {
			$o['options'] = $f['options'];
		}
		if ( $f['multiple'] ) {
			$o['multiple'] = true;
		}
		if ( null !== $f['min'] ) {
			$o['min'] = self::json_number( $f['min'] );
		}
		if ( null !== $f['max'] ) {
			$o['max'] = self::json_number( $f['max'] );
		}
		if ( '' !== $f['to'] ) {
			$o['to'] = $f['to'];
		}
		if ( array() !== $f['fields'] ) {
			$o['fields'] = array_map( array( self::class, 'field_json' ), $f['fields'] );
		}
		return $o;
	}

	/**
	 * A definition as stored and sent (`schema: auvyx-content/1`).
	 *
	 * @param array<string, mixed> $d Definition (internal shape).
	 * @return array<string, mixed>
	 */
	public static function to_json( array $d ): array {
		$types = array();
		foreach ( $d['types'] as $t ) {
			$o = array(
				'key'      => $t['key'],
				'label'    => $t['label'],
				'singular' => $t['singular'],
				'slug'     => $t['slug'],
			);
			if ( '' !== $t['icon'] ) {
				$o['icon'] = $t['icon'];
			}
			$o['public']   = $t['public'];
			$o['archive']  = $t['archive'];
			$o['supports'] = array_values( $t['supports'] );
			$o['fields']   = array_map( array( self::class, 'field_json' ), $t['fields'] );
			$types[]       = $o;
		}
		$taxonomies = array();
		foreach ( $d['taxonomies'] as $t ) {
			$taxonomies[] = array(
				'key'          => $t['key'],
				'label'        => $t['label'],
				'singular'     => $t['singular'],
				'slug'         => $t['slug'],
				'hierarchical' => $t['hierarchical'],
				'types'        => array_values( $t['types'] ),
			);
		}
		return array(
			'schema'     => self::SCHEMA,
			'types'      => $types,
			'taxonomies' => $taxonomies,
		);
	}

	/**
	 * Adds or replaces types and taxonomies by key: what the patch does not name stays.
	 *
	 * @param array<string, mixed> $base  Definition (internal shape).
	 * @param array<string, mixed> $patch Definition (internal shape).
	 * @return array<string, mixed>
	 */
	public static function merge( array $base, array $patch ): array {
		$upsert = static function ( array $xs, array $ys ): array {
			foreach ( $ys as $y ) {
				$at = array_search( $y['key'], array_column( $xs, 'key' ), true );
				if ( false === $at ) {
					$xs[] = $y;
				} else {
					$xs[ $at ] = $y;
				}
			}
			return array_values( $xs );
		};
		return array(
			'types'      => $upsert( $base['types'], $patch['types'] ),
			'taxonomies' => $upsert( $base['taxonomies'], $patch['taxonomies'] ),
		);
	}

	/**
	 * A type's binding key for a field: `<type with - for _>/<field>`.
	 *
	 * @param array<string, mixed> $type  Type.
	 * @param array<string, mixed> $field Field.
	 */
	public static function binding_key( array $type, array $field ): string {
		return str_replace( '_', '-', $type['key'] ) . '/' . $field['key'];
	}

	// ---- values ----------------------------------------------------------------------------------

	/** Valid calendar day (yyyy-mm-dd), leap years included. */
	public static function valid_day( string $s ): bool {
		if ( 1 !== preg_match( self::DAY, $s ) ) {
			return false;
		}
		$y    = (int) substr( $s, 0, 4 );
		$m    = (int) substr( $s, 5, 2 );
		$d    = (int) substr( $s, 8, 2 );
		$leap = ( 0 === $y % 4 && 0 !== $y % 100 ) || 0 === $y % 400;
		$days = array( 31, $leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 );
		return $m >= 1 && $m <= 12 && $d >= 1 && $d <= $days[ $m - 1 ];
	}

	/** Text without control characters (newlines and tabs kept for long text), trimmed. */
	private static function clean( string $s, bool $long ): string {
		$s = (string) preg_replace( $long ? '/[\x00-\x08\x0B-\x1F]/' : '/[\x00-\x1F]/', '', $s );
		return self::trim( $s );
	}

	/**
	 * @param mixed $v Value.
	 */
	private static function as_text( $v ): ?string {
		if ( is_string( $v ) ) {
			return $v;
		}
		if ( is_bool( $v ) ) {
			return $v ? '1' : '0';
		}
		if ( is_int( $v ) ) {
			return abs( $v ) < 1e15 ? (string) $v : self::java_double( (float) $v );
		}
		if ( self::is_num( $v ) ) {
			return floor( $v ) === $v && abs( $v ) < 1e15 ? (string) (int) $v : self::java_double( $v );
		}
		return null;
	}

	/**
	 * @param mixed $v Value.
	 */
	private static function as_number( $v ): ?float {
		if ( self::is_num( $v ) ) {
			return (float) $v;
		}
		if ( is_string( $v ) && 1 === preg_match( '/^-?\d{1,15}(\.\d{1,6})?$/D', self::trim( $v ) ) ) {
			return (float) self::trim( $v );
		}
		return null;
	}

	/**
	 * @param mixed $v Value.
	 */
	private static function as_id( $v ): ?int {
		if ( self::is_num( $v ) && floor( (float) $v ) === (float) $v && $v > 0 && $v < 1e15 ) {
			return (int) $v;
		}
		if ( is_string( $v ) && 1 === preg_match( '/^[1-9][0-9]{0,14}$/D', self::trim( $v ) ) ) {
			return (int) self::trim( $v );
		}
		return null;
	}

	/**
	 * @param mixed $v Value.
	 * @return array<int, mixed>
	 */
	private static function as_list( $v ): array {
		if ( null === $v ) {
			return array();
		}
		return self::is_list( $v ) ? array_values( $v ) : array( $v );
	}

	/**
	 * @param mixed $value Value.
	 * @return array{ok: bool, value: mixed, error: string}
	 */
	private static function kept( $value ): array {
		return array(
			'ok'    => true,
			'value' => $value,
			'error' => '',
		);
	}

	/**
	 * @return array{ok: bool, value: mixed, error: string}
	 */
	private static function refused( string $error ): array {
		return array(
			'ok'    => false,
			'value' => null,
			'error' => $error,
		);
	}

	/**
	 * A value as it is kept: ok with value null is "empty" (the host deletes it), not ok says why it is refused. Numbers
	 * are floats, Yes/no a boolean, images, files and links ids, galleries and multiple choices lists, rows a list of
	 * objects holding their own fields' values.
	 *
	 * @param array<string, mixed> $field Field (internal shape).
	 * @param mixed                $raw   Decoded JSON.
	 * @return array{ok: bool, value: mixed, error: string}
	 */
	public static function sanitize( array $field, $raw ): array {
		$label = (string) $field['label'];
		$empty = null === $raw || ( is_string( $raw ) && '' === self::trim( $raw ) ) || ( is_array( $raw ) && array() === $raw );
		if ( $empty ) {
			return $field['required'] ? self::refused( $label . ' is required' ) : self::kept( null );
		}
		$name = strtolower( self::KINDS[ $field['kind'] ] ?? (string) $field['kind'] );
		$bad  = self::refused( $label . ': not a valid ' . $name );
		switch ( $field['kind'] ) {
			case 'text':
			case 'textarea':
				$long = 'textarea' === $field['kind'];
				$text = self::as_text( $raw );
				if ( null === $text ) {
					return $bad;
				}
				$text = self::clean( $text, $long );
				if ( '' === $text ) {
					return $field['required'] ? self::refused( $label . ' is required' ) : self::kept( null );
				}
				$max = $long ? self::MAX_LONG : self::MAX_TEXT;
				return self::length( $text ) > $max ? self::refused( $label . ': longer than ' . $max . ' characters' ) : self::kept( $text );
			case 'number':
			case 'money':
				$n = self::as_number( $raw );
				if ( null === $n ) {
					return $bad;
				}
				if ( 'money' === $field['kind'] ) {
					$n = self::round_half_up( $n * 100 ) / 100.0;
				}
				if ( null !== $field['min'] && $n < $field['min'] ) {
					return self::refused( $label . ': at least ' . self::show( (float) $field['min'] ) );
				}
				if ( null !== $field['max'] && $n > $field['max'] ) {
					return self::refused( $label . ': at most ' . self::show( (float) $field['max'] ) );
				}
				return self::kept( $n );
			case 'date':
				$text = self::as_text( $raw );
				$text = null === $text ? null : self::trim( $text );
				return null !== $text && self::valid_day( $text ) ? self::kept( $text ) : $bad;
			case 'datetime':
				$text = self::as_text( $raw );
				$text = null === $text ? null : self::trim( $text );
				return null !== $text && 1 === preg_match( self::MOMENT, $text ) && self::valid_day( substr( $text, 0, 10 ) ) ? self::kept( $text ) : $bad;
			case 'time':
				return self::pattern( $raw, self::CLOCK, false, $bad );
			case 'email':
				return self::pattern( $raw, self::EMAIL, true, $bad );
			case 'phone':
				return self::pattern( $raw, self::PHONE, false, $bad );
			case 'url':
				return self::pattern( $raw, self::LINK, false, $bad );
			case 'color':
				return self::pattern( $raw, self::HEX, true, $bad );
			case 'checkbox':
				if ( true === $raw || ( is_string( $raw ) && in_array( $raw, array( '1', 'yes', 'true', 'on' ), true ) ) || ( self::is_num( $raw ) && 1.0 === (float) $raw ) ) {
					return self::kept( true );
				}
				if ( false === $raw || ( is_string( $raw ) && in_array( $raw, array( '0', 'no', 'false', 'off' ), true ) ) || ( self::is_num( $raw ) && 0.0 === (float) $raw ) ) {
					return $field['required'] ? self::refused( $label . ' is required' ) : self::kept( false );
				}
				return $bad;
			case 'select':
				$picked = array();
				foreach ( self::as_list( $raw ) as $item ) {
					$text = self::as_text( $item );
					if ( null !== $text && '' !== self::trim( $text ) ) {
						$picked[] = self::trim( $text );
					}
				}
				$picked = self::distinct( $picked );
				foreach ( $picked as $p ) {
					if ( ! in_array( $p, $field['options'], true ) ) {
						return $bad;
					}
				}
				if ( $field['multiple'] ) {
					return self::kept( $picked );
				}
				return 1 === count( $picked ) ? self::kept( $picked[0] ) : $bad;
			case 'image':
			case 'file':
				$id = self::as_id( $raw );
				return null === $id ? $bad : self::kept( $id );
			case 'gallery':
			case 'relation':
				$ids = array();
				foreach ( self::as_list( $raw ) as $item ) {
					$id = self::as_id( $item );
					if ( null === $id ) {
						return $bad;
					}
					$ids[] = $id;
				}
				if ( 'gallery' === $field['kind'] ) {
					return count( $ids ) > self::MAX_GALLERY ? self::refused( $label . ': more than ' . self::MAX_GALLERY . ' pictures' ) : self::kept( self::distinct( $ids ) );
				}
				if ( $field['multiple'] ) {
					return self::kept( array_slice( self::distinct( $ids ), 0, self::MAX_ROWS ) );
				}
				return 1 === count( $ids ) ? self::kept( $ids[0] ) : $bad;
			case 'repeater':
				return self::rows( $field, $raw );
		}
		return $bad;
	}

	/**
	 * @param mixed                                     $raw Value.
	 * @param array{ok: bool, value: mixed, error: string} $bad Refusal.
	 * @return array{ok: bool, value: mixed, error: string}
	 */
	private static function pattern( $raw, string $pattern, bool $lower, array $bad ): array {
		$text = self::as_text( $raw );
		if ( null === $text ) {
			return $bad;
		}
		$text = self::clean( $lower ? mb_strtolower( $text, 'UTF-8' ) : $text, false );
		return 1 === preg_match( $pattern, $text ) ? self::kept( $text ) : $bad;
	}

	/**
	 * @param array<string, mixed> $field Repeater.
	 * @param mixed                $raw   Value.
	 * @return array{ok: bool, value: mixed, error: string}
	 */
	private static function rows( array $field, $raw ): array {
		$label = (string) $field['label'];
		$rows  = self::as_list( $raw );
		if ( count( $rows ) > self::MAX_ROWS ) {
			return self::refused( $label . ': more than ' . self::MAX_ROWS . ' rows' );
		}
		$kept  = array();
		$first = '';
		foreach ( $rows as $i => $row ) {
			// An empty PHP array is `{}` here: a row is always an object.
			$cells = array() === $row ? array() : self::obj( $row );
			if ( null === $cells ) {
				$first = '' === $first ? $label . ', row ' . ( $i + 1 ) . ': not a row' : $first;
				continue;
			}
			$out   = array();
			$error = '';
			foreach ( $field['fields'] as $sub ) {
				$result = self::sanitize( $sub, $cells[ $sub['key'] ] ?? null );
				if ( ! $result['ok'] ) {
					$error = '' === $error ? $result['error'] : $error;
				} elseif ( null !== $result['value'] ) {
					$out[ $sub['key'] ] = $result['value'];
				}
			}
			if ( '' !== $error ) {
				$first = '' === $first ? $label . ', row ' . ( $i + 1 ) . ': ' . $error : $first;
				continue;
			}
			if ( array() !== $out ) {
				$kept[] = $out;
			}
		}
		if ( '' !== $first ) {
			return self::refused( $first );
		}
		if ( array() === $kept ) {
			return $field['required'] ? self::refused( $label . ' is required' ) : self::kept( null );
		}
		return self::kept( $kept );
	}

	/**
	 * Every field of an entry at once: the errors of all fields (in field order), or the kept values by key (null =
	 * empty).
	 *
	 * @param array<string, mixed> $type   Type (internal shape).
	 * @param array<string, mixed> $values Sent values by key.
	 * @return array{errors: array<int, string>, values: array<string, mixed>}
	 */
	public static function sanitize_all( array $type, array $values ): array {
		$errors = array();
		$kept   = array();
		foreach ( $type['fields'] as $field ) {
			$result = self::sanitize( $field, $values[ $field['key'] ] ?? null );
			if ( $result['ok'] ) {
				$kept[ $field['key'] ] = $result['value'];
			} else {
				$errors[] = $result['error'];
			}
		}
		return array(
			'errors' => $errors,
			'values' => array() === $errors ? $kept : array(),
		);
	}

	// ---- what a page shows -----------------------------------------------------------------------

	/**
	 * How a kept value reads in a text element. Pictures, files and links to entries are ids here (the host resolves
	 * them).
	 *
	 * @param array<string, mixed> $field Field (internal shape).
	 * @param mixed                $value Kept value.
	 */
	public static function display( array $field, $value ): string {
		$kind = (string) $field['kind'];
		if ( null === $value ) {
			return '';
		}
		if ( 'checkbox' === $kind && is_bool( $value ) ) {
			return $value ? 'Yes' : 'No';
		}
		if ( 'money' === $kind && self::is_num( $value ) ) {
			return self::money( (float) $value );
		}
		if ( 'number' === $kind && self::is_num( $value ) ) {
			return self::show( (float) $value );
		}
		if ( 'date' === $kind && is_string( $value ) && self::valid_day( $value ) ) {
			return substr( $value, 8, 2 ) . '/' . substr( $value, 5, 2 ) . '/' . substr( $value, 0, 4 );
		}
		if ( 'datetime' === $kind && is_string( $value ) && 16 === self::length( $value ) ) {
			return substr( $value, 8, 2 ) . '/' . substr( $value, 5, 2 ) . '/' . substr( $value, 0, 4 ) . ' ' . substr( $value, 11 );
		}
		if ( self::is_list( $value ) ) {
			if ( 'repeater' === $kind ) {
				return count( $value ) . ' ' . ( 1 === count( $value ) ? 'row' : 'rows' );
			}
			$parts = array();
			foreach ( $value as $item ) {
				$text = self::as_text( $item );
				if ( null !== $text ) {
					$parts[] = $text;
				}
			}
			return implode( ', ', $parts );
		}
		$text = self::as_text( $value );
		return null === $text ? '' : $text;
	}
}
